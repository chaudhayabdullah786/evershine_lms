/**
 * GET  /api/academic-upgrades/targets  — target achievement analysis for a class section
 * POST /api/academic-upgrades/targets  — assign grade targets for a subject offering
 *
 * Authorization:
 *   GET  — roles with grading_engine.read
 *   POST — roles with grading_engine.create (TEACHER, ADMIN, SUPER_ADMIN)
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { AcademicUpgradesService } from '@/lib/services/academic-upgrades-service'
import { assignTargetsSchema } from '@/lib/validation/academic-upgrades'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'grading_engine', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const classSectionId   = searchParams.get('classSectionId')
  const subjectOfferingId = searchParams.get('subjectOfferingId')

  if (!classSectionId) {
    return errors.badRequest('classSectionId query parameter is required.')
  }

  try {
    const analysis = await AcademicUpgradesService.getTargetAchievementAnalysis(
      classSectionId,
      subjectOfferingId ?? undefined,
    )
    return successResponse(analysis)
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to fetch target achievement analysis.')
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'grading_engine', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() }
  catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never) }

  const parsed = assignTargetsSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    const targets = await AcademicUpgradesService.assignTargets({
      ...parsed.data,
      assignedById: session.user.id,
    })
    return successResponse(
      targets,
      `${targets.length} student target(s) assigned for the subject offering.`,
    )
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to assign targets.')
  }
}
