/**
 * GET /api/teacher-portal/result-sessions
 *
 * Returns the active academic-year result cycle for the authenticated teacher.
 *
 * A result cycle is intentionally separate from a scheduled Exam. Exams are
 * individual assessments managed by administration; a result cycle is the
 * class report-card workspace in which all enrolled students and offerings
 * are reviewed before declaration.
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
    if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access result cycles')

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return successResponse([])

    const activeYear = await getActiveAcademicYear()
    if (!activeYear) return successResponse([])

    const sectionIds = await getTeacherClassSectionIds(teacher.id, activeYear.id)
    if (sectionIds.length === 0) return successResponse([])

    return successResponse([{
      id: activeYear.id,
      name: `${activeYear.name} — Annual Result`,
      academicYearId: activeYear.id,
      type: 'ANNUAL',
      status: 'OPEN',
      isActive: true,
      sectionCount: sectionIds.length,
    }])
  } catch (error) {
    console.error('[TEACHER_RESULT_SESSIONS_GET]', error)
    return errors.internal()
  }
}
