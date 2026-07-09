/**
 * GET /api/notifications/counts
 *
 * Returns total unread count + per-module unread counts for the authenticated user.
 * Used by the sidebar to render notification badge numbers on nav items.
 *
 * WHY a separate endpoint: The main /api/notifications returns paginated rows.
 * Sidebar badges need only aggregate counts — fetching 20 full notification rows just
 * to count them wastes bandwidth. This endpoint fetches only unread notification
 * types and aggregates them through the central type-to-module map.
 *
 * Time Complexity: O(n unread) with a narrow type-only select; LMS unread counts
 * are expected to stay small and indexed by (userId, isRead).
 * Cache: No server-side cache — counts must be fresh. Client polls every 30s alongside
 * the main notifications list, so the additional load is negligible.
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { summarizeNotificationCounts, type NotificationCounts } from '@/lib/notifications/module-map'

export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  // Fetch all unread notifications for this user — only type is needed.
  // WHY not load full rows: badges only need type values, and the composite
  // (userId, isRead) index keeps this narrow unread lookup cheap.
  const unread = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      isRead: false,
    },
    select: { type: true },
  })

  const result: NotificationCounts = summarizeNotificationCounts(unread)

  return successResponse(result)
}
