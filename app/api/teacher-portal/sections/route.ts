/**
 * GET /api/teacher-portal/sections
 *
 * Returns class sections assigned to the teacher.
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
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

    const allowedSectionIds = await getTeacherClassSectionIds(teacher.id)
    if (allowedSectionIds.length === 0) return successResponse([])

    const sections = await prisma.classSection.findMany({
      where: {
        id: { in: allowedSectionIds },
        isActive: true,
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
