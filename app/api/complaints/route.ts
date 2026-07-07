import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit-logger'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { z, ZodError, ZodIssueCode } from 'zod'
import type { Prisma, Role } from '@prisma/client'
import { dispatchToRoleUsers } from '@/lib/notifications/dispatch'

const createComplaintSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(5).max(2000),
})

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit } = parsed.data

  let where: Prisma.ComplaintWhereInput = {}

  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    // Admins see everything
    where = {}
  } else {
    // Other users see only their own complaints
    where = { complainantId: session.user.id }
  }

  const [total, complaints] = await prisma.$transaction([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return paginatedResponse(complaints, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: [], message: 'Invalid JSON' }]))
  }

  const parsed = createComplaintSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { title, description } = parsed.data

  const complaint = await prisma.$transaction(async (tx) => {
    const created = await tx.complaint.create({
      data: {
        complainantId: session.user.id,
        complainantName: session.user.name ?? session.user.email ?? 'Grievant',
        complainantRole: userRole,
        title,
        description,
        status: 'PENDING',
      },
    })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Complaint',
      entityId: created.id,
      changes: {
        title,
        description,
        status: 'PENDING',
        complainantRole: userRole,
      },
      request,
    })

    return created
  })

  // Notify all admins — fire-and-forget, must not block the complaint creation response
  const complainantName = session.user.name ?? session.user.email ?? 'A user'
  const titlePreview = title.length > 80 ? title.slice(0, 80) + '…' : title
  void dispatchToRoleUsers({
    roles: ['SUPER_ADMIN', 'ADMIN'],
    campusId: (session.user as { campusId?: string | null }).campusId ?? null,
    title: '⚠️ New Complaint Filed',
    message: `${complainantName} (${userRole}) filed a complaint: "${titlePreview}"`,
    type: 'COMPLAINT_SUBMITTED',
    relatedId: complaint.id,
  }).catch((err) => console.error('[complaints.POST] admin notification failed:', err))

  return createdResponse(complaint, 'Complaint registered successfully')
}
