import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const patchSchema = z.object({
  isOpen: z.boolean(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'teachers', 'update')
  if (denied) return denied

  const { id } = await params
  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const existing = await prisma.monthlyFeedbackCycle.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) return errors.notFound('Feedback cycle')

  const cycle = await prisma.monthlyFeedbackCycle.update({
    where: { id },
    data: { isOpen: parsed.data.isOpen },
  })

  return successResponse(cycle, parsed.data.isOpen ? 'Feedback period opened' : 'Feedback period closed')
}
