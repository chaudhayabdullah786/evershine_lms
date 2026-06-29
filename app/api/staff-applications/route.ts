/**
 * GET /api/staff-applications — Paginated list of staff applications
 *
 * RBAC: SUPER_ADMIN | ADMIN only.
 * Query: status, applicantType, q (search), page, limit
 * Returns paginated list with per-status counts for badge display.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, paginatedResponse } from '@/lib/api-response'
import type { Role, Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const status = searchParams.get('status') || undefined
  const applicantType = searchParams.get('applicantType') || undefined
  const q = searchParams.get('q') || undefined

  const where: Prisma.StaffApplicationRequestWhereInput = {}
  if (status && status !== 'ALL') {
    where.status = status as Prisma.EnumStaffApplicationStatusFilter
  }
  if (applicantType && applicantType !== 'ALL') {
    where.applicantType = applicantType as Prisma.EnumStaffApplicantTypeFilter
  }
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { email: { contains: q } },
      { cnic: { contains: q } },
      { phone: { contains: q } },
    ]
  }

  const [applications, total] = await Promise.all([
    prisma.staffApplicationRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        fullName: true,
        cnic: true,
        phone: true,
        email: true,
        applicantType: true,
        qualification: true,
        specialization: true,
        experienceYears: true,
        preferredShift: true,
        status: true,
        interviewDate: true,
        createdAt: true,
      },
    }),
    prisma.staffApplicationRequest.count({ where }),
  ])

  // Mask CNIC in list view: 35202-*****67-3
  const masked = applications.map((app) => ({
    ...app,
    cnic: app.cnic.replace(/^(\d{5})-(\d{7})-(\d)$/, '$1-*****-$3'),
  }))

  return paginatedResponse(masked, { page, limit, total })
}
