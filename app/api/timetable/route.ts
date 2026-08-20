import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import { createTimetableSchema } from '@/lib/validation/timetable'
import { sessionShiftSchema } from '@/lib/validation/shift'
import type { Prisma, Role } from '@prisma/client'
import { guardLegacyClassMutation } from '@/lib/academic/legacy-guard'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherAssignedSectionIds } from '@/lib/academic/teacher-assignments'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  
  const role = session.user.role as Role
  if (!checkPermission(role, 'calendar', 'read')) return errors.forbidden() // Re-using general calendar/academic read permission

  const { searchParams } = new URL(request.url)
  const classId = searchParams.get('classId')
  const teacherId = searchParams.get('teacherId')
  const dayOfWeek = searchParams.get('dayOfWeek')
  const shiftParam = searchParams.get('shift')
  const shiftParsed = shiftParam ? sessionShiftSchema.safeParse(shiftParam) : null
  if (shiftParam && shiftParsed && !shiftParsed.success) {
    return errors.validation(shiftParsed.error)
  }

  // TimetableSlot is the canonical source for every portal. The old
  // Timetable table is retained for migration/compatibility only and must not
  // be used for current portal reads; doing so previously surfaced stale or
  // unrelated records after an engine slot was published.
  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return successResponse([])

  const campusId = session.user.campusId
  let sectionIds: string[] = []

  if (classId) {
    const directSection = await prisma.classSection.findUnique({
      where: { id: classId },
      select: { id: true, campusId: true, isActive: true },
    })

    if (directSection) {
      sectionIds = directSection.isActive ? [directSection.id] : []
    } else {
      // Legacy callers may still send a Class ID. Resolve it only to the
      // matching active-year ClassSection; never read legacy timetable rows.
      const legacyClass = await prisma.class.findUnique({
        where: { id: classId },
        select: { grade: true, section: true, campusId: true, batchId: true, shift: true },
      })
      if (legacyClass) {
        const sections = await prisma.classSection.findMany({
          where: {
            isActive: true,
            campusId: legacyClass.campusId,
            ...(legacyClass.batchId ? { batchId: legacyClass.batchId } : {}),
            ...(legacyClass.section ? { sectionName: legacyClass.section } : {}),
            ...(legacyClass.grade ? { grade: legacyClass.grade } : {}),
            shift: { code: legacyClass.shift },
          },
          select: { id: true },
        })
        sectionIds = sections.map((section) => section.id)
      }
    }
  }

  if (teacherId) {
    const requestedTeacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, campusId: true, userId: true },
    })
    if (!requestedTeacher) return successResponse([])

    if (role === 'TEACHER') {
      const ownTeacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!ownTeacher || ownTeacher.id !== requestedTeacher.id) {
        return errors.forbidden('Teachers can only view their own timetable')
      }
    }
    if (role === 'ADMIN' && campusId && requestedTeacher.campusId !== campusId) {
      return errors.forbidden('Cannot view a teacher from another campus')
    }

    const assignedSections = await getTeacherAssignedSectionIds(requestedTeacher.id, activeYear.id)
    sectionIds = sectionIds.length > 0
      ? sectionIds.filter((id) => assignedSections.includes(id))
      : assignedSections
  }

  if (role === 'TEACHER' && !teacherId) {
    const ownTeacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    sectionIds = ownTeacher
      ? await getTeacherAssignedSectionIds(ownTeacher.id, activeYear.id)
      : []
  }

  if (role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    const enrollments = student
      ? await prisma.studentEnrollment.findMany({
          where: { studentId: student.id, academicYearId: activeYear.id, status: 'ACTIVE' },
          select: { classSectionId: true },
        })
      : []
    const enrolledSectionIds = enrollments.map((enrollment) => enrollment.classSectionId)
    sectionIds = sectionIds.length > 0
      ? sectionIds.filter((id) => enrolledSectionIds.includes(id))
      : enrolledSectionIds
  }

  if (sectionIds.length === 0) return successResponse([])

  const classSectionFilter = {
    ...(shiftParsed?.success ? { shift: { code: shiftParsed.data } } : {}),
    ...(role === 'ADMIN' && campusId ? { campusId } : {}),
  }

  const slots = await prisma.timetableSlot.findMany({
    where: {
      academicYearId: activeYear.id,
      classSectionId: { in: sectionIds },
      isPublished: true,
      ...(teacherId && { teacherId }),
      ...(dayOfWeek && { dayOfWeek: parseInt(dayOfWeek, 10) }),
      ...(Object.keys(classSectionFilter).length > 0 ? { classSection: classSectionFilter } : {}),
    },
    include: {
      classSection: {
        select: {
          id: true,
          className: true,
          sectionName: true,
          grade: true,
          campusId: true,
          shift: { select: { code: true, name: true } },
        },
      },
      teacher: {
        select: { id: true, firstName: true, lastName: true, designation: true },
      },
      subjectOffering: { include: { subject: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })

  return successResponse(slots.map((slot) => ({
    ...slot,
    // Keep the legacy display fields used by the timetable page while making
    // the underlying record unambiguously engine/published data.
    source: 'engine' as const,
    classId: slot.classSectionId,
    subjectName: slot.subjectOffering.subject.name,
    shift: slot.classSection.shift.code,
    academicYear: activeYear.name,
  })))
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  const legacyBlocked = guardLegacyClassMutation(request, 'timetable', role)
  if (legacyBlocked) return legacyBlocked
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'
  if (!isAdmin) return errors.forbidden()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = createTimetableSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data: Prisma.TimetableUncheckedCreateInput = {
    classId: parsed.data.classId!,
    teacherId: parsed.data.teacherId!,
    dayOfWeek: parsed.data.dayOfWeek!,
    startTime: parsed.data.startTime!,
    endTime: parsed.data.endTime!,
    subjectName: parsed.data.subjectName!,
    academicYear: parsed.data.academicYear!,
    shift: parsed.data.shift,
    isActive: parsed.data.isActive,
  }

  // Scoping validation: Admin cannot create timetable for a class or teacher in a different campus
  if (role === 'ADMIN' && session.user.campusId) {
    const cls = await prisma.class.findUnique({
      where: { id: data.classId },
      select: { campusId: true },
    })
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { campusId: true },
    })

    if (cls?.campusId !== session.user.campusId || teacher?.campusId !== session.user.campusId) {
      return errors.forbidden('Cannot assign class or teacher from another campus')
    }
  }

  const slot = await prisma.$transaction(async (tx) => {
    const created = await tx.timetable.create({
      data,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Timetable',
        entityId: created.id,
        changes: {
          classId: data.classId,
          teacherId: data.teacherId,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          subjectName: data.subjectName,
          academicYear: data.academicYear,
          shift: data.shift,
          isActive: data.isActive,
        },
      },
    })

    return created
  })

  return createdResponse(slot, 'Timetable slot created successfully')
}
