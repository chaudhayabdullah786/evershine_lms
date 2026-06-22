/**
 * Notification Dispatcher — centralized hub for all in-app notifications.
 * WHY: Prevents ad-hoc Notification creates scattered across 11 feature modules.
 *      All triggers route through this module for consistency, type safety, and
 *      easy future migration to WebSockets / push notifications.
 *
 * TRADEOFF: Polling-based (client polls /api/notifications every 30s).
 *           Acceptable for LMS use case; upgrade to SSE/WS when concurrent load demands.
 */

import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export type NotificationType =
  | 'RESULT_PUBLISHED'
  | 'SALARY_SLIP_ISSUED'
  | 'DATE_SHEET_PUBLISHED'
  | 'TARGET_ASSIGNED'
  | 'FEE_STATUS_UPDATE'
  | 'DAILY_SCORE_POSTED'
  | 'ATTENDANCE_ALERT'
  | 'TIMETABLE_CHANGE'
  | 'GENERAL'

interface DispatchParams {
  userId: string
  title: string
  message: string
  type: NotificationType
  relatedId?: string
  tx?: PrismaTransaction
}

interface BulkDispatchParams {
  userIds: string[]
  title: string
  message: string
  type: NotificationType
  relatedId?: string
  tx?: PrismaTransaction
}

/**
 * Dispatches a single in-app notification to one user.
 * Uses the provided transaction if supplied (for atomic operations).
 */
export async function dispatchNotification({
  userId,
  title,
  message,
  type,
  relatedId,
  tx,
}: DispatchParams): Promise<void> {
  const client = (tx ?? prisma) as PrismaClient
  await client.notification.create({
    data: {
      userId,
      title,
      message,
      type,
      relatedId: relatedId ?? null,
      isRead: false,
    },
  })
}

/**
 * Dispatches identical notifications to multiple users in a single batch insert.
 * Does NOT use createMany (unsupported on all connectors) — uses $transaction internally.
 *
 * Time Complexity: O(n) DB writes where n = userIds.length.
 * For large sections (40+ students), this is acceptable. If n > 200, consider
 * queuing with a background job instead.
 */
export async function dispatchBulkNotification({
  userIds,
  title,
  message,
  type,
  relatedId,
  tx,
}: BulkDispatchParams): Promise<void> {
  if (userIds.length === 0) return

  const client = (tx ?? prisma) as PrismaClient
  const data = userIds.map((userId) => ({
    userId,
    title,
    message,
    type,
    relatedId: relatedId ?? null,
    isRead: false,
  }))

  // WHY createMany: single round-trip vs n individual creates.
  // skipDuplicates: prevents crash if userId somehow duplicated in list.
  await client.notification.createMany({ data, skipDuplicates: true })
}

/**
 * Resolves the User IDs for all ACTIVE students enrolled in a ClassSection.
 * Used when dispatching bulk notifications after result declaration.
 */
export async function getStudentUserIdsForSection(
  classSectionId: string
): Promise<string[]> {
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId,
      status: 'ACTIVE',
    },
    select: {
      student: {
        select: { userId: true },
      },
    },
  })
  return enrollments.map((e) => e.student.userId)
}
