/**
 * GET    /api/calendar/[id] — retrieve details of a single calendar event
 * PUT    /api/calendar/[id] — update an existing calendar event (Admin/Super Admin only)
 * DELETE /api/calendar/[id] — soft-delete a calendar event (Admin/Super Admin only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  eventType: z.enum(['Holiday', 'Exam', 'Sports', 'Ceremony', 'Other']).optional(),
  campusId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'calendar', 'read')) return errors.forbidden()

  const { id } = await params

  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      endDate: true,
      eventType: true,
      campusId: true,
      isActive: true,
    },
  })

  if (!event || !event.isActive) return errors.notFound('Calendar Event')

  return successResponse(event)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'calendar', 'update')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.calendarEvent.findUnique({
    where: { id },
  })
  if (!existing || !existing.isActive) return errors.notFound('Calendar Event')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { title, description, startDate, endDate, eventType, campusId, isActive } = parsed.data

  const updated = await prisma.$transaction(async (tx) => {
    const updatedEvent = await tx.calendarEvent.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description ?? null }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(eventType !== undefined && { eventType }),
        ...(campusId !== undefined && { campusId: campusId ?? null }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        eventType: true,
        campusId: true,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'CalendarEvent',
        entityId: id,
        changes: parsed.data,
      },
    })

    return updatedEvent
  })

  return successResponse(updated, 'Calendar event updated successfully')
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'calendar', 'delete')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.calendarEvent.findUnique({
    where: { id },
  })
  if (!existing || !existing.isActive) return errors.notFound('Calendar Event')

  await prisma.$transaction(async (tx) => {
    // Soft delete
    await tx.calendarEvent.update({
      where: { id },
      data: { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'CalendarEvent',
        entityId: id,
        changes: { reason: 'soft-delete' },
      },
    })
  })

  return successResponse({ id }, 'Calendar event deleted successfully')
}
