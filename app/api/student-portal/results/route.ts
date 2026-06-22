import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { mapGradeLetter } from '@/lib/academic/grades'
import { AcademicUpgradesService } from '@/lib/services/academic-upgrades-service'

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

  if (!latestResult) {
    return successResponse({
      academicYear: activeYear,
      results: [],
      overallPercentage: null,
      overallGrade: null,
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
  })
}
