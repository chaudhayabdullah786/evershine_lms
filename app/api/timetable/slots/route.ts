import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse, errorResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createTimetableSlotSchema, publishTimetableSchema } from '@/lib/validation/academic'
import { assertAcademicYearEditable, validateTimetableSlot } from '@/lib/academic/engine'
import { timetableConflictDetails, timetableConflictSummary } from '@/lib/academic/timetable-errors'
import { timetablePersistenceError } from '@/lib/academic/timetable-schema'
import type { Prisma, Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const academicYearId = searchParams.get('academicYearId')
  const classSectionId = searchParams.get('classSectionId')
  const teacherId = searchParams.get('teacherId')
  const excludeSlotId = searchParams.get('excludeSlotId')
  const publishedOnly = searchParams.get('published') === 'true'

  if (teacherId && session.user.role === 'TEACHER') {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { userId: true },
    })
    if (!teacher || teacher.userId !== session.user.id) return errors.forbidden()
  }

  if (teacherId && session.user.role === 'ADMIN') {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { campusId: true },
    })
    if (!teacher || teacher.campusId !== session.user.campusId) return errors.forbidden()
  }

  try {
    const slots = await prisma.timetableSlot.findMany({
      where: {
        ...(academicYearId && { academicYearId }),
        ...(classSectionId && { classSectionId }),
        ...(teacherId && { teacherId }),
        ...(excludeSlotId && { id: { not: excludeSlotId } }),
        ...(publishedOnly && { isPublished: true }),
      },
      include: {
        subjectOffering: { include: { subject: true } },
        teacher: { select: { firstName: true, lastName: true } },
        room: true,
        classSection: { include: { shift: true, campus: { select: { name: true } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })

    return successResponse(slots)
  } catch (err) {
    return timetablePersistenceError(err, 'load slots')
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'create')
  if (denied) return denied

  const parsed = createTimetableSlotSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const slotData = {
    academicYearId: parsed.data.academicYearId!,
    classSectionId: parsed.data.classSectionId!,
    subjectOfferingId: parsed.data.subjectOfferingId!,
    teacherId: parsed.data.teacherId ?? null,
    roomId: parsed.data.roomId ?? undefined,
    slotType: parsed.data.slotType,
    dayOfWeek: parsed.data.dayOfWeek!,
    startTime: parsed.data.startTime!,
    endTime: parsed.data.endTime!,
  }

  try {
    await assertAcademicYearEditable(slotData.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  try {
    const conflicts = await validateTimetableSlot(slotData)
    if (conflicts.length > 0) {
      return errorResponseConflicts(conflicts)
    }

    const slot = await prisma.$transaction(async (tx) => {
      const created = await tx.timetableSlot.create({
        data: {
          ...slotData,
          roomId: slotData.roomId ?? null,
          isPublished: false,
        } satisfies Prisma.TimetableSlotUncheckedCreateInput,
      })
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'TimetableSlot',
          entityId: created.id,
          changes: { ...slotData, roomId: slotData.roomId ?? null },
        },
      })
      return created
    })

    return createdResponse(slot)
  } catch (err) {
    return timetablePersistenceError(err, 'create slot')
  }
}

/** PUT — publish timetable (locks slots as read-only for teachers) */
export async function PUT(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'update')
  if (denied) return denied

  const parsed = publishTimetableSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    await assertAcademicYearEditable(parsed.data.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  try {
    const slotsToPublish = await prisma.timetableSlot.findMany({
      where: {
        academicYearId: parsed.data.academicYearId,
        ...(parsed.data.classSectionId ? { classSectionId: parsed.data.classSectionId } : {}),
      },
      select: {
        id: true,
        academicYearId: true,
        classSectionId: true,
        subjectOfferingId: true,
        teacherId: true,
        roomId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
      },
    })

    for (const slot of slotsToPublish) {
      const conflicts = await validateTimetableSlot({
        ...slot,
        excludeSlotId: slot.id,
      })
      if (conflicts.length > 0) return errorResponseConflicts(conflicts)
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.timetableSlot.updateMany({
        where: {
          academicYearId: parsed.data.academicYearId,
          ...(parsed.data.classSectionId && { classSectionId: parsed.data.classSectionId }),
        },
        data: { isPublished: true },
      })
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'PUBLISH',
          entityType: 'Timetable',
          entityId: parsed.data.academicYearId,
          changes: {
            academicYearId: parsed.data.academicYearId,
            ...(parsed.data.classSectionId ? { classSectionId: parsed.data.classSectionId } : {}),
          },
        },
      })
      return updated
    })

    return successResponse(result, 'Timetable published')
  } catch (err) {
    return timetablePersistenceError(err, 'publish timetable')
  }
}

function errorResponseConflicts(
  conflicts: Parameters<typeof timetableConflictDetails>[0]
) {
  return errorResponse(
    'VALIDATION_ERROR',
    timetableConflictSummary(conflicts),
    400,
    timetableConflictDetails(conflicts)
  )
}
