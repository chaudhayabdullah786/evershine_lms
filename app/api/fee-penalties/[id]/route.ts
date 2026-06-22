import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createFeePolicySchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const patchSchema = createFeePolicySchema.partial().extend({
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'fee_penalties', 'update')
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.feePolicy.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Fee policy')

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const policy = await prisma.$transaction(async (tx) => {
    const updated = await tx.feePolicy.update({
      where: { id },
      data: {
        ...(parsed.data.campusId !== undefined && { campusId: parsed.data.campusId }),
        ...(parsed.data.batchId !== undefined && { batchId: parsed.data.batchId }),
        ...(parsed.data.graceDays !== undefined && { graceDays: parsed.data.graceDays }),
        ...(parsed.data.penaltyType !== undefined && { penaltyType: parsed.data.penaltyType }),
        ...(parsed.data.penaltyValue !== undefined && { penaltyValue: parsed.data.penaltyValue }),
        ...(parsed.data.maxPenalty !== undefined && { maxPenalty: parsed.data.maxPenalty }),
        ...(parsed.data.allowedLeavesPerMonth !== undefined && { allowedLeavesPerMonth: parsed.data.allowedLeavesPerMonth }),
        ...(parsed.data.leavePenaltyAmount !== undefined && { leavePenaltyAmount: parsed.data.leavePenaltyAmount }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      },
      include: { campus: { select: { name: true } }, batch: { select: { name: true } } },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: parsed.data.isActive === false ? 'DEACTIVATE' : 'UPDATE',
        entityType: 'FeePolicy',
        entityId: id,
        changes: parsed.data,
      },
    })
    return updated
  })

  return successResponse(policy)
}
