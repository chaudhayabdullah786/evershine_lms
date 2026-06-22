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
  const parsed = updateShiftTimesSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const existing = await prisma.shift.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Shift')

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.shift.update({
      where: { id },
      data: parsed.data,
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Shift',
        entityId: id,
        changes: parsed.data,
      },
    })
    return row
  })

  return successResponse(updated, 'Shift times updated')
}
