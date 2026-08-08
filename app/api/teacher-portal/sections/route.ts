/**
 * GET /api/teacher-portal/sections
 *
 * Returns class sections assigned to the teacher.
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherClassSectionIds } from '@/lib/academic/teacher-scope'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access sections')

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return successResponse([])

    const activeYear = await getActiveAcademicYear()
    const allowedSectionIds = await getTeacherClassSectionIds(teacher.id, activeYear?.id)
    if (allowedSectionIds.length === 0) return successResponse([])

    const sections = await prisma.classSection.findMany({
      where: {
        id: { in: allowedSectionIds },
        // A migrated section can be marked inactive while still carrying
        // active enrollments. Keep it available to its already-authorized
        // teacher until the enrollment data is reconciled; historical empty
        // sections remain excluded.
        OR: [
          { isActive: true },
          // WHY any-year fallback: sections with prior-year enrollments (e.g. 2025-2026
          // data when active year is 2026-2027) must still be visible to assigned
          // teachers. The isActive flag is the primary gate; this catches inactive
          // sections that still carry live students pending year-rollover.
          {
            enrollments: {
              some: { status: 'ACTIVE' as const },
            },
          },
        ],
      },
      select: {
        id: true,
        className: true,
        sectionName: true,
        shift: { select: { code: true, name: true } },
        batch: { select: { name: true } },
      },
      orderBy: [{ grade: 'asc' }, { sectionName: 'asc' }],
    })

    return successResponse(sections)
  } catch (err) {
    console.error('[TEACHER_SECTIONS_GET]', err)
    return errors.internal()
  }
}
