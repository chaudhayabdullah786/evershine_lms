import { auth } from '@/lib/auth'
import { errors } from '@/lib/api-response'

/**
 * POST /api/teacher-attendance/check-in
 *
 * Teacher self check-in is intentionally disabled. Teacher HR attendance is
 * now recorded by campus administration through /api/teachers/[id]/attendance
 * so every correction, warning, and penalty is admin-owned and audit logged.
 */
export async function POST() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  return errors.forbidden('Teacher HR attendance is recorded by campus administration only')
}
