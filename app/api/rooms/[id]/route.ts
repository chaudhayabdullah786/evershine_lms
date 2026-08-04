/**
 * PATCH /api/rooms/[id] — update room name and capacity
 * DELETE /api/rooms/[id] — soft-delete room (isActive = false)
 *
 * WHY guard on active timetable slots:
 * A room cannot be deleted if it is referenced by active (unpublished or
 * published) timetable slots. Deleting would break slot rendering in the
 * timetable view and teacher portal. The admin must first reassign or delete
 * the conflicting slots before removing the room.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { z } from 'zod'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

const updateRoomSchema = z.object({
  name:     z.string().min(1).max(80).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
})

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  // WHY 'class_sections' resource: rooms fall under campus-level admin control
  // and share the same permission matrix as class sections.
  const denied = requirePermission(session.user.role as Role, 'class_sections', 'update')
  if (denied) return denied

  const { id } = await params

  const existing = await prisma.room.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Room')

  // Scope: ADMIN can only manage rooms in their campus
  if (
    session.user.role !== 'SUPER_ADMIN' &&
    session.user.campusId &&
    existing.campusId !== session.user.campusId
  ) {
    return errors.forbidden('You can only edit rooms in your campus.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateRoomSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  // Guard: Unique name per campus
  if (parsed.data.name) {
    const collision = await prisma.room.findFirst({
      where: {
        campusId: existing.campusId,
        name:     parsed.data.name,
        id:       { not: id },
      },
      select: { id: true },
    })
    if (collision) {
      return errors.conflict('A room with this name already exists in this campus.')
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const room = await tx.room.update({
      where: { id },
      data:  parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId:     session.user.id,
        action:     'UPDATE',
        entityType: 'Room',
        entityId:   id,
        changes:    { before: existing, after: parsed.data },
      },
    })

    return room
  })

  return successResponse(updated, 'Room updated successfully')
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  const denied = requirePermission(session.user.role as Role, 'class_sections', 'delete')
  if (denied) return denied

  const { id } = await params

  const existing = await prisma.room.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Room')

  if (
    session.user.role !== 'SUPER_ADMIN' &&
    session.user.campusId &&
    existing.campusId !== session.user.campusId
  ) {
    return errors.forbidden('You can only delete rooms in your campus.')
  }

  // Guard: Block deletion if room is used by any timetable slots
  const activeSlotCount = await prisma.timetableSlot.count({
    where: { roomId: id },
  })

  if (activeSlotCount > 0) {
    return errors.conflict(
      `Cannot delete: this room is assigned to ${activeSlotCount} timetable slot(s). Reassign or delete those slots first.`
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.room.update({
      where: { id },
      data:  { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId:     session.user.id,
        action:     'DELETE',
        entityType: 'Room',
        entityId:   id,
        changes:    { campusId: existing.campusId, name: existing.name },
      },
    })
  })

  return successResponse({ id }, 'Room deleted successfully')
}
