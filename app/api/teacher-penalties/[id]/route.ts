import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createTeacherPenaltyPolicySchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const patchSchema = createTeacherPenaltyPolicySchema.partial().extend({
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'teacher_penalties', 'update')
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.teacherPenaltyPolicy.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Teacher penalty policy')

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const nextCampusId = parsed.data.campusId !== undefined ? parsed.data.campusId ?? null : existing.campusId
  const nextIsActive = parsed.data.isActive !== undefined ? parsed.data.isActive : existing.isActive
  if (nextIsActive) {
    const duplicate = await prisma.teacherPenaltyPolicy.findFirst({
      where: {
        id: { not: id },
        campusId: nextCampusId,
        isActive: true,
      },
      select: { id: true },
    })
    if (duplicate) return errors.conflict('An active teacher penalty policy already exists for this campus')
  }

  const policy = await prisma.$transaction(async (tx) => {
    const updated = await tx.teacherPenaltyPolicy.update({
      where: { id },
      data: {
        ...(parsed.data.campusId !== undefined && { campusId: parsed.data.campusId }),
        ...(parsed.data.lateThreshold !== undefined && { lateThreshold: parsed.data.lateThreshold }),
        ...(parsed.data.penaltyType !== undefined && { penaltyType: parsed.data.penaltyType }),
        ...(parsed.data.penaltyValue !== undefined && { penaltyValue: parsed.data.penaltyValue }),
        ...(parsed.data.repeatMultiplier !== undefined && {
          repeatMultiplier: parsed.data.repeatMultiplier,
        }),
        ...(parsed.data.allowedLeavesPerMonth !== undefined && { allowedLeavesPerMonth: parsed.data.allowedLeavesPerMonth }),
        ...(parsed.data.leavePenaltyAmount !== undefined && { leavePenaltyAmount: parsed.data.leavePenaltyAmount }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      },
      include: { campus: { select: { name: true } } },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: parsed.data.isActive === false ? 'DEACTIVATE' : 'UPDATE',
        entityType: 'TeacherPenaltyPolicy',
        entityId: id,
        changes: parsed.data,
      },
    })
    return updated
  })

  return successResponse(policy)
}
