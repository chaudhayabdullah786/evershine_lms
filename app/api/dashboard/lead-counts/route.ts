/**
 * GET /api/dashboard/lead-counts — Returns pending counts for all 3 tracks
 *
 * RBAC: SUPER_ADMIN | ADMIN only.
 * WHY single endpoint: The sidebar needs all 3 badge counts on every page.
 * One query is cheaper than three separate requests (waterfall avoidance).
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(_request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) return errors.forbidden()

  // Parallel count queries — all three in a single roundtrip
  const [newInquiries, pendingAdmissions, pendingStaffApps] = await Promise.all([
    prisma.landingInquiry.count({ where: { status: 'NEW' } }),
    prisma.admissionRequest.count({ where: { status: 'PENDING' } }),
    prisma.staffApplicationRequest.count({
      where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } },
    }),
  ])

  return successResponse({
    inquiries: newInquiries,
    admissions: pendingAdmissions,
    staffApplications: pendingStaffApps,
  })
}
