import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, errorResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { updateTimetableSlotSchema } from '@/lib/validation/academic'
import { assertAcademicYearEditable, validateTimetableSlot } from '@/lib/academic/engine'
import { timetableConflictDetails, timetableConflictSummary } from '@/lib/academic/timetable-errors'
import { timetablePersistenceError } from '@/lib/academic/timetable-schema'
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
  
  let existing
  try {
    existing = await prisma.timetableSlot.findUnique({ where: { id } })
  } catch (err) {
    return timetablePersistenceError(err, 'load slot for update')
  }
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

  try {
    await assertAcademicYearEditable(mergedData.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }
  
  // Validate conflicts if changing time/day/teacher/room
  if (
    parsed.data.dayOfWeek || 
    parsed.data.startTime || 
    parsed.data.endTime || 
    parsed.data.teacherId || 
    parsed.data.roomId
  ) {
    try {
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
        return errorResponse(
          'VALIDATION_ERROR',
          timetableConflictSummary(conflicts),
          400,
          timetableConflictDetails(conflicts)
        )
      }
    } catch (err) {
      return timetablePersistenceError(err, 'validate slot update')
    }
  }

  try {
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
  } catch (err) {
    return timetablePersistenceError(err, 'update slot')
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'delete')
  if (denied) return denied

  const { id } = await params
  
  let existing
  try {
    existing = await prisma.timetableSlot.findUnique({ where: { id } })
  } catch (err) {
    return timetablePersistenceError(err, 'load slot for delete')
  }
  if (!existing) return errors.notFound('Timetable Slot')

  try {
    await assertAcademicYearEditable(existing.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  try {
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
  } catch (err) {
    return timetablePersistenceError(err, 'delete slot')
  }
}
