import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import type { Prisma, Role } from '@prisma/client'
import { z } from 'zod'

const createAdminSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  campusId: z.string().min(1, 'Campus ID required'),
  permissions: z.array(z.string()).default(['attendance', 'results', 'reports']),
  department: z.string().optional(),
})

/** Create or update campus-level admin */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'users', 'create')
  if (denied) return denied

  try {
    const body = await request.json()
    const parsed = createAdminSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation(parsed.error)
    }

    const { userId, firstName, lastName, campusId, department } = parsed.data

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return errors.notFound('User not found')
    }

    // Verify campus exists
    const campus = await prisma.campus.findUnique({
      where: { id: campusId },
    })

    if (!campus) {
      return errors.notFound('Campus not found')
    }

    // Check if admin already exists
    let admin = await prisma.admin.findUnique({
      where: { userId },
    })

    if (admin) {
      // Update existing admin
      admin = await prisma.admin.update({
        where: { userId },
        data: {
          firstName,
          lastName,
          campusId,
          department,
          isActive: true,
        },
        include: { campus: true },
      })

      return successResponse({
        admin,
        message: 'Admin updated successfully',
      })
    }

    // Create new admin
    admin = await prisma.admin.create({
      data: {
        userId,
        firstName,
        lastName,
        campusId,
        department,
        isActive: true,
      },
      include: { campus: true },
    })

    return successResponse({
      admin,
      message: 'Admin created successfully',
    })
  } catch (err) {
    console.error('Admin creation error:', err)
    return errors.internal()
  }
}

/** Get all admins for a campus */
export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'users', 'read')
  if (denied) return denied

  try {
    const params = new URL(request.url).searchParams
    const campusId = params.get('campusId')

    const where: Prisma.AdminWhereInput = { isActive: true }
    if (campusId) where.campusId = campusId

    const admins = await prisma.admin.findMany({
      where,
      include: {
        campus: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse({ admins })
  } catch (err) {
    console.error('Get admins error:', err)
    return errors.internal()
  }
}
