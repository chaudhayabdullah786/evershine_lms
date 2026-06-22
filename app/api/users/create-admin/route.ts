/**
 * POST /api/users/create-admin — Allow SUPER_ADMIN or ADMIN to provision a new administrator account (User + Admin profile)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

const createAdminSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
  campusId: z.string().min(1, 'Campus assignment is required'),
  department: z.string().max(100).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return errors.unauthorized()
  }

  // Security gate: only SUPER_ADMIN or ADMIN can create new admin accounts
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    return errors.forbidden()
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON payload' }] } as never)
  }

  const parsed = createAdminSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation({
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    } as never)
  }

  const { firstName, lastName, email, password, role, campusId, department } = parsed.data

  // Security Gate: ADMINs cannot create SUPER_ADMIN accounts
  if (session.user.role === 'ADMIN' && role === 'SUPER_ADMIN') {
    return errors.forbidden('Administrators cannot create Super Administrator accounts.')
  }

  try {
    // Check if the campus exists
    const campus = await prisma.campus.findUnique({
      where: { id: campusId },
    })

    if (!campus) {
      return errors.validation({
        errors: [{ path: ['campusId'], message: 'Selected campus does not exist' }],
      } as never)
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return errors.validation({
        errors: [{ path: ['email'], message: 'Email address is already in use by another account' }],
      } as never)
    }

    const passwordHash = await hash(password, ARGON2_OPTIONS)

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role,
          isActive: true,
        },
      })

      // 2. Create Admin Profile
      const newAdmin = await tx.admin.create({
        data: {
          userId: newUser.id,
          firstName,
          lastName,
          campusId,
          department: department || null,
          isActive: true,
        },
      })

      // 3. Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'AdminProfile',
          entityId: newUser.id,
          changes: {
            email,
            role,
            firstName,
            lastName,
            campusId,
            department: department || null,
          },
        },
      })

      return { userId: newUser.id, adminId: newAdmin.id }
    })

    return successResponse(result, { message: 'Administrator profile created successfully' })
  } catch (err: any) {
    console.error('[CREATE_ADMIN_ERROR]', err)
    return errors.internal()
  }
}
