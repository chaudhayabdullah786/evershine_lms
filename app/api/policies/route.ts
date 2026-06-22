import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

// ─── Validation schemas ────────────────────────────────────────────────────

const feePolicySchema = z.object({
  campusId: z.string().optional().nullable(),
  batchId: z.string().optional().nullable(),
  graceDays: z.number().int().min(0).default(7),
  penaltyType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
  penaltyValue: z.number().min(0).default(0),
  maxPenalty: z.number().min(0).optional().nullable(),
  allowedLeavesPerMonth: z.number().int().min(0).default(1),
  leavePenaltyAmount: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
})

const teacherPolicySchema = z.object({
  campusId: z.string().optional().nullable(),
  lateThreshold: z.number().int().min(1).default(3),
  penaltyType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
  penaltyValue: z.number().min(0).default(0),
  repeatMultiplier: z.number().min(0).optional().nullable(),
  allowedLeavesPerMonth: z.number().int().min(0).default(1),
  leavePenaltyAmount: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
})

// ─── GET: Return current active policies ───────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !ADMIN_ROLES.includes(session.user.role as Role)) {
    return errors.forbidden()
  }

  const [feePolicies, teacherPolicies, campuses] = await prisma.$transaction([
    prisma.feePolicy.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.teacherPenaltyPolicy.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.campus.findMany({ select: { id: true, name: true } }),
  ])

  return successResponse({ feePolicies, teacherPolicies, campuses })
}

// ─── POST: Create a new policy ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !ADMIN_ROLES.includes(session.user.role as Role)) {
    return errors.forbidden()
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as any)
  }

  const { type, ...data } = body

  if (type === 'FEE') {
    const parsed = feePolicySchema.safeParse(data)
    if (!parsed.success) return errors.validation(parsed.error)

    const policy = await prisma.feePolicy.create({
      data: {
        campusId: parsed.data.campusId ?? null,
        batchId: parsed.data.batchId ?? null,
        graceDays: parsed.data.graceDays,
        penaltyType: parsed.data.penaltyType,
        penaltyValue: parsed.data.penaltyValue,
        maxPenalty: parsed.data.maxPenalty ?? null,
        allowedLeavesPerMonth: parsed.data.allowedLeavesPerMonth,
        leavePenaltyAmount: parsed.data.leavePenaltyAmount,
        isActive: parsed.data.isActive,
      },
    })
    return createdResponse(policy, 'Fee policy created successfully.')
  }

  if (type === 'TEACHER') {
    const parsed = teacherPolicySchema.safeParse(data)
    if (!parsed.success) return errors.validation(parsed.error)

    const policy = await prisma.teacherPenaltyPolicy.create({
      data: {
        campusId: parsed.data.campusId ?? null,
        lateThreshold: parsed.data.lateThreshold,
        penaltyType: parsed.data.penaltyType,
        penaltyValue: parsed.data.penaltyValue,
        repeatMultiplier: parsed.data.repeatMultiplier ?? null,
        allowedLeavesPerMonth: parsed.data.allowedLeavesPerMonth,
        leavePenaltyAmount: parsed.data.leavePenaltyAmount,
        isActive: parsed.data.isActive,
      },
    })
    return createdResponse(policy, 'Teacher penalty policy created successfully.')
  }

  return errors.validation({ errors: [{ path: ['type'], message: 'type must be FEE or TEACHER' }] } as any)
}

// ─── PATCH: Toggle isActive or update fields ───────────────────────────────

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !ADMIN_ROLES.includes(session.user.role as Role)) {
    return errors.forbidden()
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as any)
  }

  const { type, id, ...data } = body
  if (!id) return errors.validation({ errors: [{ path: ['id'], message: 'id is required' }] } as any)

  if (type === 'FEE') {
    const parsed = feePolicySchema.partial().safeParse(data)
    if (!parsed.success) return errors.validation(parsed.error)
    const updated = await prisma.feePolicy.update({ where: { id }, data: parsed.data })
    return successResponse(updated, { message: 'Fee policy updated.' })
  }

  if (type === 'TEACHER') {
    const parsed = teacherPolicySchema.partial().safeParse(data)
    if (!parsed.success) return errors.validation(parsed.error)
    const updated = await prisma.teacherPenaltyPolicy.update({ where: { id }, data: parsed.data })
    return successResponse(updated, { message: 'Teacher policy updated.' })
  }

  return errors.validation({ errors: [{ path: ['type'], message: 'type must be FEE or TEACHER' }] } as any)
}
