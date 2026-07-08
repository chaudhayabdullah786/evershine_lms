/**
 * GET /api/notifications/counts
 *
 * Returns total unread count + per-module unread counts for the authenticated user.
 * Used by the sidebar to render notification badge numbers on nav items.
 *
 * WHY a separate endpoint: The main /api/notifications returns paginated rows.
 * Sidebar badges need only aggregate counts — fetching 20 full rows just to count
 * them wastes bandwidth. This endpoint does a single GROUP BY in one query.
 *
 * Time Complexity: O(1) — single aggregate query with a small GROUP BY (≤20 distinct types).
 * Cache: No server-side cache — counts must be fresh. Client polls every 30s alongside
 * the main notifications list, so the additional load is negligible.
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

// Maps Notification.type values → sidebar module badge keys.
// WHY here not client: keeps the mapping server-authoritative. Adding a new type
// only requires updating this map; the frontend reads the module key directly.
const TYPE_TO_MODULE: Record<string, string> = {
  // Leaves module
  LEAVE_SUBMITTED:      'leaves',
  LEAVE_APPROVED:       'leaves',
  LEAVE_REJECTED:       'leaves',
  // Complaints module
  COMPLAINT_SUBMITTED:  'complaints',
  COMPLAINT_RESOLVED:   'complaints',
  // Academic Queries module
  QUERY_RECEIVED:       'queries',
  QUERY_ANSWERED:       'queries',
  // Admissions module
  ADMISSION_APPROVED:   'admissions',
  ADMISSION_DECLINED:   'admissions',
  // Timetable module
  TIMETABLE_REQUEST:    'timetable',
  TIMETABLE_UPDATE:     'timetable',
  TIMETABLE_CHANGE:     'timetable',
  // Fees / Fee Collection module
  FEE_REMINDER:         'fees',
  FEE_STATUS_UPDATE:    'fees',
  // Landing Leads module
  LEAD_SUBMITTED:       'leads',
  // Staff Directory module
  STAFF_APP_SUBMITTED:  'staff',
  // Salary Slips module
  SALARY_SLIP_ISSUED:   'salaries',
  // Results / Academic module
  RESULT_PUBLISHED:     'results',
  DATE_SHEET_PUBLISHED: 'results',
  // Attendance module
  ATTENDANCE_ALERT:     'attendance',
}

export interface NotificationCounts {
  total: number
  modules: Record<string, number>
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  // Fetch all unread notifications for this user — only type + id needed.
  // WHY not groupBy: Prisma groupBy does not support MySQL's GROUP BY without
  // having syntax in all versions. Raw aggregate on a small set (typically <50
  // unread) is clean and fast.
  const unread = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      isRead: false,
    },
    select: { type: true },
  })

  // Aggregate counts per module key
  const modules: Record<string, number> = {}
  for (const { type } of unread) {
    const moduleKey = TYPE_TO_MODULE[type]
    if (moduleKey) {
      modules[moduleKey] = (modules[moduleKey] ?? 0) + 1
    }
  }

  const result: NotificationCounts = {
    total: unread.length,
    modules,
  }

  return successResponse(result)
}
