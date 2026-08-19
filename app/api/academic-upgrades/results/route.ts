/**
 * GET   /api/academic-upgrades/results  — fetch student result card or class sheet
 * POST  /api/academic-upgrades/results  — bulk score entry for a student
 * PATCH /api/academic-upgrades/results  — toggle DECLARED / DRAFT for a class term
 *
 * Authorization:
 *   GET   — any role with results.read
 *   POST  — roles with results.create (TEACHER, ADMIN, SUPER_ADMIN)
 *   PATCH — roles with results.update (ADMIN, SUPER_ADMIN)
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { AcademicUpgradesService, type SubmitScoresInput } from '@/lib/services/academic-upgrades-service'
import { submitScoresSchema, declareResultSchema } from '@/lib/validation/academic-upgrades'
import type { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertGuardianAccessToStudent } from '@/lib/academic/guardian'
import { getTeacherClassSectionIds } from '@/lib/academic/teacher-scope'
import { formatExamSessionLabel, parseResultCardConfig } from '@/lib/academic/result-card-config'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'results', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const studentId      = searchParams.get('studentId')
  const examSessionId  = searchParams.get('examSessionId')
  const classSectionId = searchParams.get('classSectionId')

  const declaredOnly = ['STUDENT', 'PARENT', 'GUARDIAN'].includes(role)

  try {
    if (studentId) {
      if (role === 'STUDENT') {
        const student = await prisma.student.findUnique({
          where: { userId: session.user.id },
          select: { id: true },
        })
        if (!student || student.id !== studentId) {
          return errors.forbidden('You can only view your own declared results.')
        }
      }

      if (role === 'PARENT' || role === 'GUARDIAN') {
        const allowed = await assertGuardianAccessToStudent(session.user.id, studentId)
        if (!allowed) return errors.forbidden('You can only view your linked children.')
      }

      if (role === 'TEACHER') {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: session.user.id },
          select: { id: true },
        })
        if (!teacher) return errors.forbidden()

        const sectionIds = await getTeacherClassSectionIds(teacher.id)
        const enrollment = await prisma.studentEnrollment.findFirst({
          where: {
            studentId,
            classSectionId: { in: sectionIds },
            status: 'ACTIVE',
          },
          select: { id: true },
        })
        if (!enrollment) {
          return errors.forbidden('You can only view students in your assigned sections.')
        }
      }

      const card = await AcademicUpgradesService.getStudentTermResults(
        studentId,
        examSessionId ?? undefined,
        declaredOnly
      )
      const rawResults = Array.isArray(card) ? card : card ? [card] : []
      const sessionIds = [...new Set(rawResults.map((result) => result.examSessionId))]
      const [exams, academicYears] = sessionIds.length > 0
        ? await Promise.all([
            prisma.exam.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } }),
            prisma.academicYear.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } }),
          ])
        : [[], []]
      const examNames = new Map(exams.map((exam) => [exam.id, exam.name]))
      const yearNames = new Map(academicYears.map((year) => [year.id, `${year.name} — Annual Result`]))
      const normalized = rawResults.map((result) => {
        const resultWithConfig = result as typeof result & { resultCardConfig?: unknown }
        return {
        ...result,
        examSessionLabel: examNames.get(result.examSessionId)
          ?? yearNames.get(result.examSessionId)
          ?? formatExamSessionLabel(result.examSessionId),
        resultCardConfig: parseResultCardConfig(resultWithConfig.resultCardConfig),
        manualPosition: result.manualPosition ?? null,
        overallPercentage: Number(result.overallPercentage),
        subjectResults: result.subjectResults.map((subjectResult) => ({
          ...subjectResult,
          totalMarks: Number(subjectResult.totalMarks),
          obtainedMarks: subjectResult.obtainedMarks === null ? null : Number(subjectResult.obtainedMarks),
          percentage: subjectResult.percentage === null ? null : Number(subjectResult.percentage),
        })),
        }
      })
      return successResponse(Array.isArray(card) ? normalized : normalized[0] ?? null)
    }

    if (classSectionId && examSessionId) {
      if (!['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(role)) {
        return errors.forbidden('Class result sheets are restricted to staff.')
      }

      if (role === 'TEACHER') {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: session.user.id },
          select: { id: true },
        })
        if (!teacher) return errors.forbidden()
        const sectionIds = await getTeacherClassSectionIds(teacher.id)
        if (!sectionIds.includes(classSectionId)) {
          return errors.forbidden('You can only view result sheets for your assigned sections.')
        }
      }

      const sheet = await AcademicUpgradesService.getClassResultsSheet(classSectionId, examSessionId)
      return successResponse(sheet)
    }

    return errors.badRequest(
      'Provide either studentId, or both classSectionId and examSessionId.',
    )
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to fetch results.')
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'results', 'create')) return errors.forbidden()
  let body: unknown
  try { body = await request.json() }
  catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never) }

  const parsed = submitScoresSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    const payload: SubmitScoresInput = {
      classSectionId: parsed.data.classSectionId!,
      examSessionId: parsed.data.examSessionId!,
      studentId: parsed.data.studentId!,
      scores: parsed.data.scores!.map((score) => ({
        subjectOfferingId: score.subjectOfferingId!,
        totalMarks: score.totalMarks!,
        obtainedMarks: score.obtainedMarks ?? null,
        isAbsent: score.isAbsent,
        isNotApplicable: score.isNotApplicable,
        remarks: score.remarks,
      })),
      teacherId: session.user.id,
    }
    const result = await AcademicUpgradesService.submitStudentScores(payload)
    return successResponse(result, 'Scores submitted. Overall percentage and grade recalculated.')
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to submit scores.')
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'results', 'update')) return errors.forbidden()
  let body: unknown
  try { body = await request.json() }
  catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never) }

  const parsed = declareResultSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { classSectionId, examSessionId, declare } = parsed.data

  try {
    const status = await AcademicUpgradesService.toggleResultDeclaration(
      classSectionId,
      examSessionId,
      declare,
    )
    return successResponse(
      status,
      declare
        ? 'Results declared. Class positions have been calculated.'
        : 'Results reverted to draft. Positions cleared.',
    )
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to toggle result declaration.')
  }
}
