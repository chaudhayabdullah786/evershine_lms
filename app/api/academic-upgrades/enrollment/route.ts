/**
 * PATCH /api/academic-upgrades/enrollment
 * Updates a student's enrollment type with a mandatory audit trail.
 * Authorization: SUPER_ADMIN / ADMIN only (students.update).
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { AcademicUpgradesService } from '@/lib/services/academic-upgrades-service'
import { updateEnrollmentTypeSchema } from '@/lib/validation/academic-upgrades'
import type { Role } from '@prisma/client'

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'students', 'update')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() }
  catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never) }

  const parsed = updateEnrollmentTypeSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    const auditRecord = await AcademicUpgradesService.updateStudentEnrollmentType({
      ...parsed.data,
      updatedById: session.user.id,
    })
    return successResponse(auditRecord, 'Enrollment type updated and audit log created.')
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to update enrollment type.')
  }
}
