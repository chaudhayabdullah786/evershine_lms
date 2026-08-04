import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { updateShiftTimesSchema } from '@/lib/validation/feedback'
import type { Role } from '@prisma/client'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'shifts', 'update')
  if (denied) return denied

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.badRequest('Invalid or malformed JSON request body')
  }

  const parsed = updateShiftTimesSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const existing = await prisma.shift.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Shift')

  // Validate that startTime < endTime when both are provided
  if (parsed.data.startTime && parsed.data.endTime) {
    const [sh, sm] = parsed.data.startTime.split(':').map(Number)
    const [eh, em] = parsed.data.endTime.split(':').map(Number)
    if (sh * 60 + sm >= eh * 60 + em) {
      return errors.badRequest('Start time must be before end time')
    }
  }

  // Build update payload — only include fields present in the parsed data
  const updateData: {
    name?: string
    startTime?: string
    endTime?: string
    lateGraceMinutes?: number
  } = {}

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name
  if (parsed.data.startTime !== undefined) updateData.startTime = parsed.data.startTime
  if (parsed.data.endTime !== undefined) updateData.endTime = parsed.data.endTime
  if (parsed.data.lateGraceMinutes !== undefined) updateData.lateGraceMinutes = parsed.data.lateGraceMinutes

  if (Object.keys(updateData).length === 0) {
    return errors.badRequest('No update fields provided')
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.shift.update({
        where: { id },
        data: updateData,
      })
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'Shift',
          entityId: id,
          changes: updateData,
        },
      })
      return row
    })

    return successResponse(updated, 'Shift updated successfully')
  } catch (err) {
    console.error('[SHIFT PATCH] Transaction failed:', err)
    return errors.internal()
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'shifts', 'delete')
  if (denied) return denied

  const { id } = await params

  const existing = await prisma.shift.findUnique({
    where: { id },
    include: { classSections: { select: { id: true }, take: 1 } },
  })
  if (!existing) return errors.notFound('Shift')

  // Prevent deletion if class sections are linked
  if (existing.classSections.length > 0) {
    return errors.conflict('Cannot delete shift: it has class sections assigned. Reassign sections first.')
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.shift.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'DELETE',
          entityType: 'Shift',
          entityId: id,
          changes: { code: existing.code, name: existing.name },
        },
      })
    })
    return successResponse(null, 'Shift deleted')
  } catch (err) {
    console.error('[SHIFT DELETE] Transaction failed:', err)
    return errors.internal()
  }
}
