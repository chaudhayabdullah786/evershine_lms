import { NextRequest } from 'next/server'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { bootstrapAcademicFoundation } from '@/lib/academic/bootstrap'
import { ensureMonthlyFeedbackCycles } from '@/lib/feedback/engine'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const bodySchema = z
  .object({
    yearName: z.string().min(4).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .optional()

/** POST — idempotent seed of shifts + active academic year (admin). */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'create')
  if (denied) return denied

  let raw: unknown = {}
  try {
    raw = await request.json()
  } catch {
    raw = {}
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return errors.validation(parsed.error)

  const result = await bootstrapAcademicFoundation(parsed.data)
  await ensureMonthlyFeedbackCycles()
  return successResponse(result, 'Academic foundation ready')
}
