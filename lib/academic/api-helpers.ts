import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import type { AcademicResource } from '@/lib/rbac'

export async function requireSession() {
  const session = await auth()
  if (!session?.user) return { error: errors.unauthorized(), session: null }
  return { session, error: null }
}

export function requirePermission(role: Role, resource: AcademicResource, action: 'create' | 'read' | 'update' | 'delete') {
  if (!checkPermission(role, resource, action)) return errors.forbidden()
  return null
}

export function campusScope(
  role: Role,
  userCampusId: string | null | undefined,
  requestedCampusId?: string | null
): string | undefined {
  if (role === 'SUPER_ADMIN') return requestedCampusId ?? undefined
  return userCampusId ?? undefined
}
