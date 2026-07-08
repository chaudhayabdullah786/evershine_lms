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
  // ── Pre-existing ────────────────────────────────────────────────────────────
  | 'RESULT_PUBLISHED'
  | 'SALARY_SLIP_ISSUED'
  | 'DATE_SHEET_PUBLISHED'
  | 'TARGET_ASSIGNED'
  | 'FEE_STATUS_UPDATE'
  | 'DAILY_SCORE_POSTED'
  | 'ATTENDANCE_ALERT'
  | 'TIMETABLE_CHANGE'
  | 'TIMETABLE_REQUEST'   // admin: teacher submitted a timetable change request
  | 'TIMETABLE_UPDATE'    // teacher/student: request approved/rejected
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'FEE_REMINDER'
  | 'COMPLAINT_RESOLVED'
  | 'GENERAL'
  | 'INFO'
  // ── New: submission events (actor → admins/teachers) ─────────────────────
  | 'LEAVE_SUBMITTED'       // admin notified: new leave request
  | 'COMPLAINT_SUBMITTED'   // admin notified: new complaint filed
  | 'QUERY_RECEIVED'        // teacher notified: student submitted a query
  | 'QUERY_ANSWERED'        // student notified: teacher answered their query
  | 'ADMISSION_APPROVED'    // student in-app welcome after admission approval
  | 'ADMISSION_DECLINED'    // applicant notified of decline (best-effort)
  | 'LEAD_SUBMITTED'        // admin notified: new landing inquiry
  | 'STAFF_APP_SUBMITTED'   // admin notified: new staff application

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

interface RoleBroadcastParams {
  roles: Array<'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'ACCOUNTANT' | 'STUDENT' | 'GUARDIAN' | 'PARENT'>
  title: string
  message: string
  type: NotificationType
  relatedId?: string
  /**
   * When provided, ADMIN users are filtered to those with a matching campusId.
   * SUPER_ADMIN users are always included regardless of campusId.
   */
  campusId?: string | null
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
  // WHY: avoid casting to PrismaClient — Prisma transaction client satisfies
  // the notification API without type coercion. The cast was the original bug.
  const client = tx ?? prisma
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
 *
 * Time Complexity: O(1) DB round-trips via createMany.
 * For large sections (40+ students), this is acceptable. If n > 200, consider
 * queuing with a background job instead.
 *
 * skipDuplicates: prevents crash if userId somehow appears twice in the list.
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

  const client = tx ?? prisma
  const data = userIds.map((userId) => ({
    userId,
    title,
    message,
    type,
    relatedId: relatedId ?? null,
    isRead: false,
  }))

  await client.notification.createMany({ data, skipDuplicates: true })
}

/**
 * Broadcasts a notification to all active users matching the specified roles.
 *
 * Campus scoping:
 *   - When campusId is provided, ADMIN users are filtered to those on that campus.
 *   - SUPER_ADMIN users are always included regardless.
 *   - All other roles (TEACHER, STUDENT etc.) receive no campus filter.
 *
 * WHY fire-and-forget at the call site: use `void dispatchToRoleUsers(...)` when
 * the broadcast is non-critical (e.g. informational admin alerts). For atomic
 * operations include it inside a $transaction instead.
 *
 * Time Complexity: O(1) DB query (single findMany with OR) + O(n) batch insert.
 */
export async function dispatchToRoleUsers({
  roles,
  title,
  message,
  type,
  relatedId,
  campusId,
}: RoleBroadcastParams): Promise<void> {
  type ValidRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'ACCOUNTANT' | 'STUDENT' | 'GUARDIAN' | 'PARENT'

  // Build per-role WHERE fragments. SUPER_ADMIN always included; ADMIN campus-scoped if campusId set.
  const whereConditions = roles.map((role) => {
    if (role === 'SUPER_ADMIN') {
      return { role: 'SUPER_ADMIN' as ValidRole, isActive: true }
    }
    if (role === 'ADMIN' && campusId) {
      return { role: 'ADMIN' as ValidRole, isActive: true, campusId }
    }
    return { role: role as ValidRole, isActive: true }
  })

  const users = await prisma.user.findMany({
    where: { OR: whereConditions },
    select: { id: true },
  })

  const userIds = users.map((u) => u.id)
  if (userIds.length === 0) return

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      title,
      message,
      type,
      relatedId: relatedId ?? null,
      isRead: false,
    })),
    skipDuplicates: true,
  })
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
