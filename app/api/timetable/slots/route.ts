import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createTimetableSlotSchema, publishTimetableSchema } from '@/lib/validation/academic'
import { assertAcademicYearEditable, validateTimetableSlot } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const academicYearId = searchParams.get('academicYearId')
  const classSectionId = searchParams.get('classSectionId')
  const publishedOnly = searchParams.get('published') === 'true'

  const slots = await prisma.timetableSlot.findMany({
    where: {
      ...(academicYearId && { academicYearId }),
      ...(classSectionId && { classSectionId }),
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
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'create')
  if (denied) return denied

  const parsed = createTimetableSlotSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    await assertAcademicYearEditable(parsed.data.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  const conflicts = await validateTimetableSlot(parsed.data)
  if (conflicts.length > 0) {
    return errorResponseConflicts(conflicts)
  }

  const slot = await prisma.$transaction(async (tx) => {
    const created = await tx.timetableSlot.create({ data: { ...parsed.data, isPublished: false } })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'TimetableSlot',
        entityId: created.id,
        changes: parsed.data,
      },
    })
    return created
  })

  return createdResponse(slot)
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
        changes: parsed.data,
      },
    })
    return updated
  })

  return successResponse(result, 'Timetable published')
}

function errorResponseConflicts(
  conflicts: { type: string; message: string }[]
) {
  return errors.validation({
    errors: conflicts.map((c, i) => ({ path: [String(i)], message: `[${c.type}] ${c.message}` })),
  } as never)
}
