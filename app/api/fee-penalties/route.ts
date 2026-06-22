import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createFeePolicySchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'fee_penalties', 'read')
  if (denied) return denied

  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === '1'

  const policies = await prisma.feePolicy.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: { campus: { select: { name: true } }, batch: { select: { name: true } } },
  })
  return successResponse(policies)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'fee_penalties', 'create')
  if (denied) return denied

  const parsed = createFeePolicySchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const policy = await prisma.$transaction(async (tx) => {
    const created = await tx.feePolicy.create({
      data: {
        campusId: parsed.data.campusId,
        batchId: parsed.data.batchId,
        graceDays: parsed.data.graceDays,
        penaltyType: parsed.data.penaltyType,
        penaltyValue: parsed.data.penaltyValue,
        maxPenalty: parsed.data.maxPenalty,
        allowedLeavesPerMonth: parsed.data.allowedLeavesPerMonth,
        leavePenaltyAmount: parsed.data.leavePenaltyAmount,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'FeePolicy',
        entityId: created.id,
        changes: parsed.data,
      },
    })
    return created
  })

  return createdResponse(policy)
}
