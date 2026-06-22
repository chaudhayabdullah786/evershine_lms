import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, paginatedResponse, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.string().optional(),
})

/**
 * GET /api/notifications
 * Returns paginated notifications for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit, unreadOnly } = parsed.data

  const where: Prisma.NotificationWhereInput = {
    userId: session.user.id,
    ...(unreadOnly === 'true' ? { isRead: false } : {}),
  }

  const total = await prisma.notification.count({ where })
  const notifications = await prisma.notification.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  return paginatedResponse(notifications, { page, limit, total })
}

/**
 * PATCH /api/notifications
 * Mark all notifications as read for the authenticated user.
 */
export async function PATCH() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })

  return successResponse({ marked: true }, { message: 'All notifications marked as read.' })
}
