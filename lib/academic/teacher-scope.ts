import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherAssignedSectionIds } from '@/lib/academic/teacher-assignments'

export async function getTeacherByUserId(userId: string) {
  return prisma.teacher.findUnique({
    where: { userId },
    select: { id: true, campusId: true, isActive: true },
  })
}

/**
 * Resolve the teacher's current section scope from the canonical assignment
 * table only. Historical tasks, results, legacy classes, and old timetable
 * rows are intentionally not authorization sources.
 */
export async function getTeacherClassSectionIds(
  teacherId: string,
  academicYearId?: string,
): Promise<string[]> {
  const year = academicYearId
    ? await prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { id: true },
      })
    : await getActiveAcademicYear()

  if (!year) return []
  return getTeacherAssignedSectionIds(teacherId, year.id)
}

export async function teacherCanAccessClassSection(
  teacherId: string,
  classSectionId: string,
  academicYearId?: string,
): Promise<boolean> {
  const allowed = await getTeacherClassSectionIds(teacherId, academicYearId)
  return allowed.includes(classSectionId)
}
