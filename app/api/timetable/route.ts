import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import { createTimetableSchema } from '@/lib/validation/timetable'
import { sessionShiftSchema } from '@/lib/validation/shift'
import type { Prisma, Role } from '@prisma/client'
import { guardLegacyClassMutation } from '@/lib/academic/legacy-guard'

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

  // Scoping: ADMIN is scoped to their campusId
  const isSuperAdmin = role === 'SUPER_ADMIN'
  const campusId = session.user.campusId

  const where: any = {
    isActive: true,
    ...(classId && { classId }),
    ...(teacherId && { teacherId }),
    ...(dayOfWeek && { dayOfWeek: parseInt(dayOfWeek, 10) }),
    ...(shiftParsed?.success && { shift: shiftParsed.data }),
  }

  // Enforce campus boundaries
  if (!isSuperAdmin && campusId) {
    where.class = { campusId }
  }

  const slots = await prisma.timetable.findMany({
    where,
    include: {
      class: {
        select: {
          id: true,
          name: true,
          grade: true,
          section: true,
          shift: true,
          campusId: true,
        },
      },
      teacher: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          designation: true,
        },
      },
    },
    orderBy: [
      { dayOfWeek: 'asc' },
      { startTime: 'asc' },
    ],
  })

  return successResponse(slots)
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
