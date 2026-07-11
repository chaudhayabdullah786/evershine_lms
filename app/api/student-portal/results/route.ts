import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { mapGradeLetter } from '@/lib/academic/grades'
import { AcademicUpgradesService } from '@/lib/services/academic-upgrades-service'
import { toPortalMonthlyMonitoringReport, type MonthlyMonitoringRepository } from '@/lib/academic/monitoring-report'

export const dynamic = 'force-dynamic'

const monitoringModel = prisma.monthlyMonitoringReport as unknown as MonthlyMonitoringRepository

/** Published student portal results now sourced from the new TermResult flow. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const student = await prisma.student.findUnique({ where: { userId: session.user.id } })
  if (!student) return errors.notFound('Student')

  const activeYear = await getActiveAcademicYear()
  const termResults = await AcademicUpgradesService.getStudentTermResults(student.id, undefined, true)
  const latestResult = Array.isArray(termResults) ? termResults[0] : termResults
  const enrollment = activeYear ? await prisma.studentEnrollment.findFirst({ where: { studentId: student.id, academicYearId: activeYear.id, status: 'ACTIVE' }, select: { classSectionId: true } }) : null
  const [dailyMonitoring, monthlyMonitoring] = await Promise.all([
    enrollment && activeYear
      ? prisma.dailyPerformanceScore.findMany({
          where: {
            studentId: student.id,
            date: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            subjectOffering: { classSectionId: enrollment.classSectionId, academicYearId: activeYear.id },
          },
          include: { subjectOffering: { include: { subject: { select: { name: true, code: true } } } } },
          orderBy: { date: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
    enrollment && activeYear
      ? monitoringModel.findMany({
          where: { classSectionId: enrollment.classSectionId, academicYearId: activeYear.id, declarationStatus: 'DECLARED' },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
  ])
  const monitoringReports = {
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
    monthly: monthlyMonitoring.flatMap((report) => {
      const studentReport = toPortalMonthlyMonitoringReport(report, student.id)
      return studentReport ? [studentReport] : []
    }),
  }

  if (!latestResult) {
    return successResponse({
      academicYear: activeYear,
      results: [],
      overallPercentage: null,
      overallGrade: null,
      monitoringReports,
    })
  }

  const results = (latestResult.subjectResults ?? []).map((subjectResult) => {
    const obtainedMarks = Number(subjectResult.obtainedMarks?.toString() ?? '0')
    const totalMarks = subjectResult.totalMarks
    const percentage = subjectResult.percentage != null
      ? Number(subjectResult.percentage.toString())
      : totalMarks > 0
        ? Math.round((obtainedMarks / totalMarks) * 10000) / 100
        : 0

    return {
      subjectId: subjectResult.subjectOffering.subjectId,
      subjectName: subjectResult.subjectOffering.subject.name,
      subjectCode: subjectResult.subjectOffering.subject.code,
      gradingSchemeId: latestResult.id,
      schemeName: latestResult.examSessionId.replace(/-/g, ' ').toUpperCase(),
      percentage,
      grade: subjectResult.grade ?? mapGradeLetter(percentage),
      isPassed: subjectResult.resultStatus === 'Pass' || percentage >= 33,
      breakdown: [
        {
          component: 'Total Marks',
          weight: 100,
          obtained: obtainedMarks,
          maxMarks: totalMarks,
        },
      ],
    }
  })

  return successResponse({
    academicYear: activeYear,
    results,
    overallPercentage: Number(latestResult.overallPercentage.toString()),
    overallGrade: latestResult.grade,
    monitoringReports,
  })
}
