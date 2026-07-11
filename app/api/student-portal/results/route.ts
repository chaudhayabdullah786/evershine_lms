import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { mapGradeLetter } from '@/lib/academic/grades'
import { toPortalMonthlyMonitoringReport, type MonthlyMonitoringRepository } from '@/lib/academic/monitoring-report'

export const dynamic = 'force-dynamic'

const monitoringModel = prisma.monthlyMonitoringReport as unknown as MonthlyMonitoringRepository

/**
 * GET /api/student-portal/results
 *
 * Returns all DECLARED TermResults for the authenticated student, spanning
 * all exam sessions. Each result includes subject-level breakdown, grade,
 * class position, and performance batch. Also returns monitoring reports.
 *
 * WHY all sessions (not just latest): Students need to review past exam
 * results across terms. The UI renders them grouped by exam session.
 *
 * TRADEOFF: If a student has many sessions, this query grows linearly.
 * At this scale (≤12 sessions/year) the cost is negligible.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const student = await prisma.student.findUnique({ where: { userId: session.user.id } })
  if (!student) return errors.notFound('Student')

  const activeYear = await getActiveAcademicYear()

  // ── All enrollments for this student in the active year ──────────────────
  const enrollments = activeYear
    ? await prisma.studentEnrollment.findMany({
        where: { studentId: student.id, academicYearId: activeYear.id, status: 'ACTIVE' },
        select: { id: true, classSectionId: true },
      })
    : []

  const classSectionIds = enrollments.map((e) => e.classSectionId)

  // ── All DECLARED TermResults across all enrolled sections ────────────────
  const allTermResults = await prisma.termResult.findMany({
    where: {
      studentId: student.id,
      declarationStatus: 'DECLARED',
    },
    include: {
      classSection: {
        select: {
          className: true,
          sectionName: true,
          shift: { select: { code: true, name: true } },
        },
      },
      subjectResults: {
        include: {
          subjectOffering: {
            include: { subject: { select: { id: true, name: true, code: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ examSessionId: 'desc' }, { createdAt: 'desc' }],
  })

  // ── Monitoring reports (daily 90-day window + declared monthly) ──────────
  const [dailyMonitoring, monthlyMonitoring, taskResults] = await Promise.all([
    classSectionIds.length > 0 && activeYear
      ? prisma.dailyPerformanceScore.findMany({
          where: {
            studentId: student.id,
            date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            subjectOffering: {
              classSectionId: { in: classSectionIds },
              academicYearId: activeYear.id,
            },
          },
          include: {
            subjectOffering: {
              include: { subject: { select: { name: true, code: true } } },
            },
          },
          orderBy: { date: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
    classSectionIds.length > 0 && activeYear
      ? monitoringModel.findMany({
          where: {
            classSectionId: { in: classSectionIds },
            academicYearId: activeYear.id,
            declarationStatus: 'DECLARED',
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
    prisma.taskResult.findMany({
      where: { studentId: student.id },
      include: {
        task: {
          include: {
            class: { select: { name: true, section: true } },
            classSection: { select: { className: true, sectionName: true, shift: { select: { code: true, name: true } } } },
            subject: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
  ])

  const monitoringReports = {
    daily: dailyMonitoring.map((entry) => ({
      date: entry.date,
      courseName: entry.subjectOffering.subject.name,
      remarks: entry.remarks,
      // WHY cast: DailyPerformanceScore has grade+highlight at DB level;
      // Prisma types lag schema — safe cast for runtime access.
      grade: (entry as typeof entry & { grade?: string | null }).grade ?? null,
      highlight: (entry as typeof entry & { highlight?: string | null }).highlight ?? null,
    })),
    monthly: monthlyMonitoring.flatMap((report) => {
      const studentReport = toPortalMonthlyMonitoringReport(report, student.id)
      return studentReport ? [studentReport] : []
    }),
  }

  // ── Map TermResults to portal shape ──────────────────────────────────────
  const declaredResults = allTermResults.map((termResult) => {
    const overallPct = Number(termResult.overallPercentage.toString())

    const subjects = termResult.subjectResults.map((sr) => {
      const obtained = Number(sr.obtainedMarks?.toString() ?? '0')
      const total = sr.totalMarks
      const pct =
        sr.percentage != null
          ? Number(sr.percentage.toString())
          : total > 0
          ? Math.round((obtained / total) * 10000) / 100
          : 0

      return {
        subjectId: sr.subjectOffering.subject.id,
        subjectName: sr.subjectOffering.subject.name,
        subjectCode: sr.subjectOffering.subject.code,
        totalMarks: total,
        obtainedMarks: obtained,
        percentage: pct,
        grade: sr.grade ?? mapGradeLetter(pct),
        resultStatus: sr.resultStatus ?? 'Pending',
        isPassed: sr.resultStatus === 'Pass' || pct >= 33,
        isAbsent: sr.isAbsent,
        isNotApplicable: sr.isNotApplicable,
        remarks: sr.remarks ?? null,
        performanceBatch: sr.performanceBatch ?? null,
      }
    })

    return {
      termResultId: termResult.id,
      examSessionId: termResult.examSessionId,
      // Human-readable label: replace dashes/underscores with spaces, title-case
      examSessionLabel: termResult.examSessionId
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      sectionLabel: `${termResult.classSection.className}-${termResult.classSection.sectionName}`,
      shiftName: termResult.classSection.shift?.name ?? null,
      overallPercentage: overallPct,
      grade: termResult.grade,
      classPosition: termResult.classPosition ?? null,
      performanceBatch: termResult.performanceBatch,
      teacherRemarks: termResult.teacherRemarks ?? null,
      declaredAt: termResult.declaredAt ?? null,
      subjects,
    }
  })

  // Backward-compat: keep `results` and `overallPercentage` fields for the
  // existing UI that reads them, sourced from the most recent declared result.
  const latest = declaredResults[0] ?? null

  const legacyResults = (latest?.subjects ?? []).map((sr) => ({
    subjectId: sr.subjectId,
    subjectName: sr.subjectName,
    subjectCode: sr.subjectCode,
    gradingSchemeId: latest?.termResultId ?? '',
    schemeName: latest?.examSessionLabel ?? '',
    percentage: sr.percentage,
    grade: sr.grade,
    isPassed: sr.isPassed,
    breakdown: [
      {
        component: 'Total Marks',
        weight: 100,
        obtained: sr.obtainedMarks,
        maxMarks: sr.totalMarks,
      },
    ],
  }))

  return successResponse({
    academicYear: activeYear,
    // Enhanced multi-session results
    declaredResults,
    // Legacy single-session results (for backward-compat with existing Results tab)
    results: legacyResults,
    overallPercentage: latest?.overallPercentage ?? null,
    overallGrade: latest?.grade ?? null,
    latestExamSession: latest?.examSessionLabel ?? null,
    latestPerformanceBatch: latest?.performanceBatch ?? null,
    latestClassPosition: latest?.classPosition ?? null,
    latestTeacherRemarks: latest?.teacherRemarks ?? null,
    monitoringReports,
    taskResults: taskResults.map((record) => ({
      id: record.id,
      taskId: record.taskId,
      title: record.task.title,
      type: record.task.type,
      dueDate: record.task.dueDate,
      maxMarks: record.task.maxMarks,
      obtainedMarks: Number(record.obtainedMarks),
      percentage: record.task.maxMarks > 0 ? Math.round((Number(record.obtainedMarks) / record.task.maxMarks) * 10000) / 100 : 0,
      remarks: record.remarks,
      subjectName: record.task.subject.name,
      subjectCode: record.task.subject.code,
      classLabel: record.task.classSection
        ? `${record.task.classSection.className}-${record.task.classSection.sectionName}`
        : `${record.task.class.name}${record.task.class.section ? `-${record.task.class.section}` : ''}`,
      shiftName: record.task.classSection?.shift?.name ?? null,
      updatedAt: record.updatedAt,
    })),
  })
}
