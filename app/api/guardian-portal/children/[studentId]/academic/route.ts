import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { assertGuardianAccessToStudent } from '@/lib/academic/guardian'
import { getActiveAcademicYear, calculateWeightedPercentage } from '@/lib/academic/engine'
import { mapGradeLetter } from '@/lib/academic/grades'
import { toPortalMonthlyMonitoringReport, type MonthlyMonitoringRepository } from '@/lib/academic/monitoring-report'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!['PARENT', 'GUARDIAN', 'SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return errors.forbidden()
  }

  const { studentId } = await params

  if (['PARENT', 'GUARDIAN'].includes(session.user.role)) {
    const allowed = await assertGuardianAccessToStudent(session.user.id, studentId)
    if (!allowed) return errors.forbidden('You can only view your linked children')
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      campus: { select: { name: true } },
      batch: { select: { name: true } },
      class: { select: { name: true, shift: true } },
    },
  })
  if (!student) return errors.notFound('Student')

  const activeYear = await getActiveAcademicYear()

  const enrollments = activeYear
    ? await prisma.studentEnrollment.findMany({
        where: { studentId, academicYearId: activeYear.id, status: 'ACTIVE' },
        include: {
          classSection: { include: { shift: true, campus: true, batch: true } },
          subjectEnrollments: {
            where: { status: 'APPROVED' },
            include: { subjectOffering: { include: { subject: true, teacher: { select: { firstName: true, lastName: true } } } } },
          },
        },
      })
    : []

  const enrollment = enrollments[0] ?? null

  const [dailyMonitoring, declaredMonthly] = enrollments.length && activeYear
    ? await Promise.all([
        prisma.dailyPerformanceScore.findMany({
          where: {
            studentId,
            date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            subjectOffering: {
              classSectionId: { in: enrollments.map((record) => record.classSectionId) },
              academicYearId: activeYear.id,
            },
          },
          include: { subjectOffering: { include: { subject: { select: { name: true, code: true } } } } },
          orderBy: { date: 'desc' },
          take: 100,
        }),
        (prisma.monthlyMonitoringReport as unknown as MonthlyMonitoringRepository).findMany({
          where: {
            classSectionId: { in: enrollments.map((record) => record.classSectionId) },
            academicYearId: activeYear.id,
            declarationStatus: 'DECLARED',
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 12,
        }),
      ])
    : [[], []]

  const attendanceRecords = enrollments.length
    ? await prisma.enrollmentAttendanceRecord.findMany({
        where: { studentEnrollmentId: { in: enrollments.map((e) => e.id) } },
        orderBy: { attendanceDate: 'desc' },
        take: 90,
      })
    : []

  const attSummary = {
    present: attendanceRecords.filter((r) => r.status === 'PRESENT').length,
    absent: attendanceRecords.filter((r) => r.status === 'ABSENT').length,
    late: attendanceRecords.filter((r) => r.status === 'LATE').length,
    excused: attendanceRecords.filter((r) => r.status === 'EXCUSED').length,
    total: attendanceRecords.length,
  }
  const attendancePct =
    attSummary.total > 0
      ? Math.round(((attSummary.present + attSummary.late + attSummary.excused) / attSummary.total) * 100)
      : null

  const results: Array<{
    subjectName: string
    percentage: number
    grade: string
    isPassed: boolean
  }> = []

  if (activeYear) {
    for (const enr of enrollments) {
    for (const se of enr.subjectEnrollments) {
      const scheme = await prisma.academicGradingScheme.findFirst({
        where: {
          academicYearId: activeYear.id,
          classSectionId: enr.classSectionId,
          subjectId: se.subjectOffering.subjectId,
          isPublished: true,
        },
        include: { components: { include: { assessments: { include: { scores: true } } } } },
      })
      if (!scheme) continue

      const components = scheme.components.map((comp) => {
        const obtained = comp.assessments.reduce((sum, a) => {
          const score = a.scores.find((s) => s.studentEnrollmentId === enr.id)
          return sum + (score?.obtainedMarks ?? 0)
        }, 0)
        return { maxMarks: comp.maxMarks, weightPercentage: comp.weightPercentage, obtained }
      })
      const percentage = calculateWeightedPercentage(components)
      results.push({
        subjectName: `${se.subjectOffering.subject.name} (${enr.classSection.shift.name})`,
        percentage,
        grade: mapGradeLetter(percentage),
        isPassed: percentage >= 33,
      })
    }
    }
  }

  const timetable =
    activeYear && enrollments.length
      ? (
          await Promise.all(
            enrollments.map((enr) =>
              prisma.timetableSlot.findMany({
                where: {
                  academicYearId: activeYear.id,
                  classSectionId: enr.classSectionId,
                  isPublished: true,
                },
                include: {
                  subjectOffering: { include: { subject: true } },
                  teacher: { select: { firstName: true, lastName: true } },
                },
                orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
              })
            )
          )
        ).flat()
      : []

  const feeInvoices = await prisma.feeInvoice.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true,
      challanNumber: true,
      month: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      dueDate: true,
      penaltyAmount: true,
      proofStatus: true,
    },
  })

  return successResponse({
    student,
    activeYear,
    enrollmentIds: enrollments.map((e) => e.id),
    enrollments,
    enrollment,
    attendance: { records: attendanceRecords, summary: { ...attSummary, attendancePct } },
    results,
    overallPercentage:
      results.length > 0
        ? Math.round((results.reduce((s, r) => s + r.percentage, 0) / results.length) * 100) / 100
        : null,
    timetable,
    feeInvoices,
    monitoringReports: {
      daily: dailyMonitoring.map((entry) => {
        const assessment = entry as typeof entry & { grade?: string | null; highlight?: string | null }
        return {
          date: entry.date,
          courseName: entry.subjectOffering.subject.name,
          remarks: entry.remarks,
          grade: assessment.grade,
          highlight: assessment.highlight,
        }
      }),
      monthly: declaredMonthly.flatMap((report) => {
        const studentReport = toPortalMonthlyMonitoringReport(report, studentId)
        return studentReport ? [studentReport] : []
      }),
    },
  })
}
