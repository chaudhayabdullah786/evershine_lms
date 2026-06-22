/**
 * GET /api/exports/staff
 * Returns ALL non-teacher staff members (Admins and Accountants) for Excel export.
 *
 * RBAC: SUPER_ADMIN, ADMIN only.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'teachers', 'read')) return errors.forbidden() // standard staff read check

  // Campus scoping: non-super-admins only see their campus
  const campusId =
    role === 'SUPER_ADMIN'
      ? (new URL(request.url).searchParams.get('campusId') ?? undefined)
      : (session.user.campusId ?? undefined)

  const [admins, accountants] = await Promise.all([
    prisma.admin.findMany({
      where: {
        ...(campusId && { campusId }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        firstName: true,
        lastName: true,
        department: true,
        isActive: true,
        createdAt: true,
        user: { select: { email: true, role: true } },
        campus: { select: { name: true } },
      },
    }),
    prisma.accountant.findMany({
      where: {
        ...(campusId && { campusId }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        firstName: true,
        lastName: true,
        employeeId: true,
        phoneNumber: true,
        isActive: true,
        createdAt: true,
        user: { select: { email: true, role: true } },
      },
    }),
  ])

  // Combine into a standardized staff list
  const staffList = [
    ...admins.map(a => ({
      name: `${a.firstName} ${a.lastName}`,
      role: a.user.role,
      email: a.user.email,
      phone: 'N/A',
      employeeId: 'N/A',
      department: a.department || 'Administration',
      campusName: a.campus?.name || 'All Campuses',
      status: a.isActive ? 'Active' : 'Suspended',
      joinedAt: a.createdAt,
    })),
    ...accountants.map(ac => ({
      name: `${ac.firstName} ${ac.lastName}`,
      role: ac.user.role,
      email: ac.user.email,
      phone: ac.phoneNumber,
      employeeId: ac.employeeId,
      department: 'Finance / Accounts',
      campusName: 'Central Office',
      status: ac.isActive ? 'Active' : 'Suspended',
      joinedAt: ac.createdAt,
    })),
  ]

  return successResponse(staffList)
}
