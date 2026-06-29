import { auth } from '@/lib/auth'
import { errors } from '@/lib/api-response'

const ALLOWED_ROLES = ['TEACHER', 'ADMIN', 'SUPER_ADMIN']

const DEPRECATION_MESSAGE =
  'Legacy grading-schema API is retired and no longer supported.'
const MIGRATION_HINT =
  'Use the new Grade Entry workflow at /dashboard/teacher/grade-entry or the academic grading engine APIs under /api/grading-schemes.'

type LegacySession = { user?: { role?: string | null } } | null | undefined

function requireLegacyAccess(session: LegacySession) {
  if (!session?.user) return errors.unauthorized()
  if (!ALLOWED_ROLES.includes(session.user.role)) return errors.forbidden('Access denied')
  return null
}

export async function GET() {
  const session = await auth()
  const authError = requireLegacyAccess(session)
  if (authError) return authError

  return errors.legacyDeprecated(DEPRECATION_MESSAGE, MIGRATION_HINT)
}

export async function POST() {
  const session = await auth()
  const authError = requireLegacyAccess(session)
  if (authError) return authError

  return errors.legacyDeprecated(DEPRECATION_MESSAGE, MIGRATION_HINT)
}

export async function DELETE() {
  const session = await auth()
  const authError = requireLegacyAccess(session)
  if (authError) return authError

  return errors.legacyDeprecated(DEPRECATION_MESSAGE, MIGRATION_HINT)
}
