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

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'results', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const studentId      = searchParams.get('studentId')
  const examSessionId  = searchParams.get('examSessionId')
  const classSectionId = searchParams.get('classSectionId')

  const declaredOnly = role === 'STUDENT' || role === 'GUARDIAN'

  try {
    if (studentId) {
      const card = await AcademicUpgradesService.getStudentTermResults(
        studentId,
        examSessionId ?? undefined,
        declaredOnly
      )
      return successResponse(card)
    }

    if (classSectionId && examSessionId) {
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
