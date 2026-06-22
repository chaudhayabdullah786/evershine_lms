import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { updateTimetableSlotSchema } from '@/lib/validation/academic'
import { validateTimetableSlot } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'update')
  if (denied) return denied

  const { id } = await params
  
  const existing = await prisma.timetableSlot.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Timetable Slot')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateTimetableSlotSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const mergedData = { ...existing, ...parsed.data }
  
  // Validate conflicts if changing time/day/teacher/room
  if (
    parsed.data.dayOfWeek || 
    parsed.data.startTime || 
    parsed.data.endTime || 
    parsed.data.teacherId || 
    parsed.data.roomId
  ) {
    const conflicts = await validateTimetableSlot({
      academicYearId: mergedData.academicYearId,
      classSectionId: mergedData.classSectionId,
      subjectOfferingId: mergedData.subjectOfferingId,
      teacherId: mergedData.teacherId,
      roomId: mergedData.roomId,
      dayOfWeek: mergedData.dayOfWeek,
      startTime: mergedData.startTime,
      endTime: mergedData.endTime,
      excludeSlotId: id
    })
    if (conflicts.length > 0) {
      return errors.validation({
        errors: conflicts.map((c, i) => ({ path: [String(i)], message: `[${c.type}] ${c.message}` })),
      } as never)
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.timetableSlot.update({
      where: { id },
      data: parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'TimetableSlot',
        entityId: id,
        changes: parsed.data,
      },
    })

    return res
  })

  return successResponse(updated, 'Timetable slot updated successfully')
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'delete')
  if (denied) return denied

  const { id } = await params
  
  const existing = await prisma.timetableSlot.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Timetable Slot')

  await prisma.$transaction(async (tx) => {
    await tx.timetableSlot.delete({ where: { id } })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'TimetableSlot',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Timetable slot deleted successfully')
}
