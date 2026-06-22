import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

/**
 * PATCH /api/notifications/[id]
 * Mark a single notification as read.
 */
export async function PATCH(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const notification = await prisma.notification.findUnique({
    where: { id: params.id },
  })

  if (!notification) return errors.notFound('Notification')
  if (notification.userId !== session.user.id) return errors.forbidden()

  const updated = await prisma.notification.update({
    where: { id: params.id },
    data: { isRead: true },
  })

  return successResponse(updated, { message: 'Notification marked as read.' })
}
