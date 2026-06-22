import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createTeacherPenaltyPolicySchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'teacher_penalties', 'read')
  if (denied) return denied

  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === '1'

  const policies = await prisma.teacherPenaltyPolicy.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: { campus: { select: { name: true } } },
  })
  return successResponse(policies)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'teacher_penalties', 'create')
  if (denied) return denied

  const parsed = createTeacherPenaltyPolicySchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const policy = await prisma.$transaction(async (tx) => {
    const created = await tx.teacherPenaltyPolicy.create({
      data: {
        campusId: parsed.data.campusId ?? null,
        lateThreshold: parsed.data.lateThreshold,
        penaltyType: parsed.data.penaltyType,
        penaltyValue: parsed.data.penaltyValue,
        repeatMultiplier: parsed.data.repeatMultiplier ?? null,
        allowedLeavesPerMonth: parsed.data.allowedLeavesPerMonth,
        leavePenaltyAmount: parsed.data.leavePenaltyAmount,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'TeacherPenaltyPolicy',
        entityId: created.id,
        changes: parsed.data,
      },
    })
    return created
  })

  return createdResponse(policy)
}
