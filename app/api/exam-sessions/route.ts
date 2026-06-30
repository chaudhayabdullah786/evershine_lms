import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

/**
 * Lightweight exam-session catalog backed by academic years.
 *
 * The Academic Upgrade tables store examSessionId as a string rather than a
 * dedicated relation. Using AcademicYear.id gives the UI a stable cuid that
 * works with existing validation without introducing a production migration.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  if (!checkPermission(session.user.role as Role, 'exams', 'read')) {
    return errors.forbidden()
  }

  const years = await prisma.academicYear.findMany({
    orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
    select: { id: true, name: true, isActive: true },
  })

  const sessions = years.map((year) => ({
    id: year.id,
    name: year.isActive ? `${year.name} (Active)` : year.name,
    term: year.isActive ? 'ACTIVE_YEAR' : 'ACADEMIC_YEAR',
  }))

  return successResponse(sessions)
}
