import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import { getTeacherClassSectionIds } from '@/lib/academic/teacher-scope'
import { resolveClassContext } from '@/lib/teacher-access'

/**
 * Lightweight exam-session catalog. SuperAdmin/admin consumers retain the
 * academic-year options used by the legacy results UI; teacher consumers get
 * the published Exam records scoped to their assigned class sections.
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

  // Teachers should enter marks against the exam scheduled for one of their
  // assigned sections, rather than against an academic-year placeholder. The
  // legacy Exam table is still the source of truth for SuperAdmin schedules,
  // so bridge its classId to canonical ClassSection IDs through the same
  // access resolver used by the teacher portal.
  if (session.user.role === 'TEACHER') {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return successResponse([])

    const allowedSectionIds = await getTeacherClassSectionIds(teacher.id)
    if (allowedSectionIds.length === 0) return successResponse([])

    const sectionToLegacyClass = await Promise.all(
      allowedSectionIds.map(async (classSectionId) => ({
        classSectionId,
        context: await resolveClassContext(classSectionId),
      }))
    )
    const sectionByLegacyClassId = new Map(
      sectionToLegacyClass
        .filter(({ context }) => context.legacyClassId)
        .map(({ classSectionId, context }) => [context.legacyClassId as string, classSectionId])
    )
    if (sectionByLegacyClassId.size === 0) return successResponse([])

    const exams = await prisma.exam.findMany({
      where: {
        isActive: true,
        classId: { in: [...sectionByLegacyClassId.keys()] },
      },
      include: {
        class: { select: { name: true, grade: true, section: true } },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })

    return successResponse(exams.map((exam) => ({
      id: exam.id,
      name: exam.name,
      term: exam.academicYear,
      classSectionId: sectionByLegacyClassId.get(exam.classId) ?? null,
      legacyClassId: exam.classId,
      classLabel: exam.class.name,
      totalMarks: exam.totalMarks,
      startDate: exam.startDate.toISOString(),
      endDate: exam.endDate.toISOString(),
    })))
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
