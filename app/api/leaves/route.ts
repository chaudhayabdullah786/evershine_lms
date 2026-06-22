import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit-logger'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { z, ZodError, ZodIssueCode } from 'zod'
import type { Role, Prisma } from '@prisma/client'

const createLeaveSchema = z.object({
  leaveType: z.enum(['CASUAL', 'SICK', 'MATERNITY', 'EMERGENCY', 'OTHER']),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().min(5).max(1000),
})

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// Roles that can apply for leave
const APPLICANT_ROLES: Role[] = ['TEACHER', 'ACCOUNTANT', 'STUDENT']

// Roles that can review/approve leave requests
const REVIEWER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit } = parsed.data

  const userRole = session.user.role as Role
  const userId = session.user.id

  let where: Prisma.LeaveRequestWhereInput = {}

  if (REVIEWER_ROLES.includes(userRole)) {
    // Admins see all leave requests, including student submissions.
    where = {}
  } else if (APPLICANT_ROLES.includes(userRole)) {
    // Staff only see their own requests
    where = { applicantId: userId }
  } else {
    return errors.forbidden()
  }

  const [total, requests] = await prisma.$transaction([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return paginatedResponse(requests, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role

  // ADMIN/SUPER_ADMIN cannot apply for leave — they only review
  if (!APPLICANT_ROLES.includes(userRole)) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: [], message: 'Invalid JSON body' }]))
  }

  const parsed = createLeaveSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { leaveType, startDate, endDate, reason } = parsed.data

  // Validate date range
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: ['startDate'], message: 'Invalid date format' }]))
  }
  if (end < start) {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: ['endDate'], message: 'End date must be after start date' }]))
  }

  const leave = await prisma.$transaction(async (tx) => {
    const newLeave = await tx.leaveRequest.create({
      data: {
        applicantId: session.user.id,
        applicantName: session.user.name ?? session.user.email ?? 'Unknown User',
        applicantRole: userRole,
        leaveType,
        startDate: start,
        endDate: end,
        reason,
        status: 'PENDING',
      },
    })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'LeaveRequest',
      entityId: newLeave.id,
      changes: {
        leaveType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        reason,
        status: 'PENDING',
        applicantRole: userRole,
      },
      request,
    })

    return newLeave
  })

  return createdResponse(leave, 'Leave application submitted successfully. Awaiting admin review.')
}
