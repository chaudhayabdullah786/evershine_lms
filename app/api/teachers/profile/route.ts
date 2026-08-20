import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherSectionAssignments } from '@/lib/academic/teacher-assignments'

const normalizeShift = (value?: string | null) => {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, '') ?? ''
  return normalized.endsWith('SHIFT')
    ? normalized.slice(0, -'SHIFT'.length)
    : normalized
}

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'TEACHER') {
      return errors.unauthorized()
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: {
        campus: { select: { name: true, code: true } },
        batch: { select: { name: true } },
      }
    })

    if (!teacher) {
      return errors.notFound('Teacher profile')
    }

    // The profile endpoint is consumed by the dashboard and timetable page.
    // It must use the same canonical, active-year assignment source as every
    // teacher workflow; legacy ClassTeacher rows and old timetable slots are
    // intentionally not used for authorization or display.
    const activeYear = await getActiveAcademicYear()
    const sectionAssignments = activeYear
      ? await getTeacherSectionAssignments(teacher.id, activeYear.id)
      : []
    const sectionIds = sectionAssignments.map((assignment) => assignment.classSectionId)

    const publishedTimetableSlot = activeYear && sectionIds.length > 0
      ? await prisma.timetableSlot.findFirst({
          where: {
            teacherId: teacher.id,
            academicYearId: activeYear.id,
            classSectionId: { in: sectionIds },
            isPublished: true,
          },
          select: {
            id: true,
            classSection: {
              select: { shift: { select: { code: true } } },
            },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        })
      : null

    const classes = sectionAssignments.map((assignment) => {
      const section = assignment.classSection
      const shift = normalizeShift(section.shift?.code ?? section.shift?.name)
      return {
        id: assignment.id,
        classId: section.id,
        academicYear: activeYear?.name ?? null,
        isClassTeacher: assignment.isClassTeacher,
        class: {
          id: section.id,
          name: section.className,
          grade: section.grade,
          section: section.sectionName,
          shift: shift || 'MORNING',
        },
      }
    })

    return successResponse({
      ...teacher,
      academicYear: activeYear
        ? { id: activeYear.id, name: activeYear.name }
        : null,
      sectionAssignments,
      // Compatibility shape for existing dashboard/timetable consumers. The
      // values are derived from canonical assignments and active-year slots.
      classes,
      timetableSlots: publishedTimetableSlot ? [publishedTimetableSlot] : [],
    })
  } catch (error) {
    console.error('[TEACHER_PROFILE_GET]', error)
    return errors.internal()
  }
}
