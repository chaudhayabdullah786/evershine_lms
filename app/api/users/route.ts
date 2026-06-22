/**
 * GET /api/users — Paginated/searchable list of all system users (Admin/Super Admin only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse, paginatedResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  
  // Checking admin permission to read users
  if (!checkPermission(session.user.role as Role, 'users', 'read') && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    return errors.forbidden()
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const roleParam = searchParams.get('role') || ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 20))

  const where: any = {}

  if (roleParam) {
    if (roleParam.includes(',')) {
      where.role = { in: roleParam.split(',') as Role[] }
    } else {
      where.role = roleParam as Role
    }
  }

  if (query) {
    where.OR = [
      { email: { contains: query, mode: 'insensitive' } },
      {
        student: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { fatherName: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      {
        teacher: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      {
        admin: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      {
        parent: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      {
        guardian: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
    ]
  }

  try {
    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { firstName: true, lastName: true } },
          teacher: { select: { firstName: true, lastName: true } },
          admin: {
            include: {
              campus: {
                select: { id: true, name: true }
              }
            }
          },
          parent: { select: { firstName: true, lastName: true } },
          guardian: { select: { firstName: true, lastName: true } },
          accountant: {
            include: {
              campus: { select: { id: true, name: true } }
            }
          },
        },
      }),
    ])

    const formattedUsers = users.map((u) => {
      const profile = u.student ?? u.teacher ?? u.admin ?? u.parent ?? u.guardian ?? u.accountant
      const name = profile ? `${profile.firstName} ${profile.lastName}` : 'No Profile Associated'
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        name,
        lastLogin: u.lastLogin,
        adminProfile: u.admin ? {
          firstName:  u.admin.firstName,
          lastName:   u.admin.lastName,
          campusId:   u.admin.campusId,
          campusName: u.admin.campus?.name ?? 'Unassigned',
          department: u.admin.department ?? 'N/A'
        } : null,
        accountantProfile: u.accountant ? {
          firstName:   u.accountant.firstName,
          lastName:    u.accountant.lastName,
          employeeId:  u.accountant.employeeId,
          campusId:    u.accountant.campusId,
          campusName:  u.accountant.campus?.name ?? 'Unassigned',
          phoneNumber: u.accountant.phoneNumber,
        } : null
      }
    })

    return paginatedResponse(formattedUsers, { page, limit, total })
  } catch (err: any) {
    console.error('[USERS_GET_ERROR]', err)
    return errors.internal()
  }
}
