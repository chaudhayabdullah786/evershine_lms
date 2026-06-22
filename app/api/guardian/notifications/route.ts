/**
 * GET /api/guardian/notifications
 * Cursor-paginated notification feed for the guardian.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { guardianNotificationQuerySchema } from '@/lib/validation/guardian'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = guardianNotificationQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { limit, cursor } = parsed.data

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    take: limit + 1, // take one extra to determine next cursor
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  })

  let nextCursor: string | undefined = undefined
  if (notifications.length > limit) {
    const nextItem = notifications.pop()
    nextCursor = nextItem?.id
  }

  // Count unread
  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  })

  return successResponse(
    { notifications, unreadCount },
    undefined,
    { nextCursor }
  )
}

/**
 * PATCH /api/guardian/notifications
 * Mark notifications as read.
 */
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden()

  let body: { ids?: string[] }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  if (body.ids && body.ids.length > 0) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, id: { in: body.ids } },
      data: { isRead: true },
    })
  } else {
    // Mark all as read
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    })
  }

  return successResponse({ success: true })
}
