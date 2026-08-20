/**
 * GET /api/teacher-portal/classes
 *
 * Returns only the requesting teacher's active section assignments for the
 * active academic year. Historical legacy rows, tasks, results, and timetable
 * records are not authorization sources.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherSectionAssignments } from '@/lib/academic/teacher-assignments'
import { sessionShiftSchema } from '@/lib/validation/shift'

const normalizeShiftValue = (value?: string | null) => {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, '') ?? ''
  return normalized.endsWith('SHIFT') ? normalized.slice(0, -'SHIFT'.length) : normalized
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const allowedRoles = ['TEACHER', 'SUPER_ADMIN', 'ADMIN']
  if (!allowedRoles.includes(session.user.role)) {
    return errors.forbidden('Only teachers can access this')
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  // Admins without a teacher profile retain the administrative section view.
  if (!teacher) {
    if (['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
      const allSections = await prisma.classSection.findMany({
        where: { isActive: true },
        include: {
          shift: true,
          campus: { select: { name: true, code: true } },
          batch: { select: { name: true, code: true, academicLevel: true } },
        },
        orderBy: [{ grade: 'asc' }, { sectionName: 'asc' }],
      })
      return successResponse(allSections.map((section) => ({
        id: section.id,
        name: section.className,
        section: section.sectionName,
        classSectionId: section.id,
        legacyClassId: null,
        grade: section.grade ?? 0,
        shift: section.shift?.code ?? 'MORNING',
        batchId: section.batchId,
        campusId: section.campusId,
        campus: section.campus,
        batch: section.batch,
        isClassTeacher: false,
        isSubjectTeacher: false,
        subjects: [],
      })))
    }
    return successResponse([])
  }

  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return successResponse([])

  const { searchParams } = new URL(req.url)
  const shiftParam = searchParams.get('shift')
  const shiftFilter = shiftParam ? sessionShiftSchema.safeParse(shiftParam) : null
  if (shiftParam && shiftFilter && !shiftFilter.success) {
    return errors.validation(shiftFilter.error)
  }

  const assignments = await getTeacherSectionAssignments(teacher.id, activeYear.id)
  if (assignments.length === 0) return successResponse([])

  const sectionIds = assignments.map((assignment) => assignment.classSectionId)
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      academicYearId: activeYear.id,
      classSectionId: { in: sectionIds },
    },
    select: {
      classSectionId: true,
      teacherId: true,
      subject: { select: { id: true, name: true, code: true } },
    },
  })

  const assignmentBySection = new Map(
    assignments.map((assignment) => [assignment.classSectionId, assignment])
  )

  const classes = assignments
    .map((assignment) => {
      const section = assignment.classSection
      if (!section) return null

      const sectionOfferings = offerings.filter(
        (offering) => offering.classSectionId === section.id
      )
      const visibleOfferings = assignment.isClassTeacher
        ? sectionOfferings
        : sectionOfferings.filter((offering) => offering.teacherId === teacher.id)
      const subjects = visibleOfferings.reduce<{ id: string; name: string; code: string }[]>(
        (items, offering) => {
          if (!items.some((item) => item.id === offering.subject.id)) {
            items.push(offering.subject)
          }
          return items
        },
      [])
      const shift = normalizeShiftValue(section.shift?.code ?? section.shift?.name)

      return {
        id: section.id,
        name: section.className,
        section: section.sectionName,
        grade: section.grade ?? 0,
        shift: shift || 'MORNING',
        classSectionId: section.id,
        legacyClassId: null,
        batchId: section.batchId,
        campusId: section.campusId,
        campus: section.campus,
        batch: section.batch,
        academicYear: activeYear.name,
        isClassTeacher: assignmentBySection.get(section.id)?.isClassTeacher ?? false,
        isSubjectTeacher: subjects.length > 0,
        subjects,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => !shiftFilter?.success || entry.shift === shiftFilter.data)

  return successResponse(classes)
}
