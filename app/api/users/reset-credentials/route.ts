/**
 * POST /api/users/reset-credentials — Reset email & password credentials for any user (Admin/Super Admin only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { hash } from '@node-rs/argon2'
import type { Role } from '@prisma/client'

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  
  // Credentials reset is a sensitive administrative function requiring update on users resource
  if (!checkPermission(session.user.role as Role, 'users', 'update') && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    return errors.forbidden()
  }

  let body: { userId: string; newEmail?: string; newPassword?: string }
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const { userId, newEmail, newPassword } = body
  if (!userId) {
    return errors.validation({ errors: [{ path: ['userId'], message: 'User ID is required' }] } as never)
  }

  if (!newEmail && !newPassword) {
    return errors.validation({ errors: [{ path: [], message: 'Specify new email or new password to reset' }] } as never)
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      student:    true,
      teacher:    true,
      parent:     true,
      guardian:   true,
      accountant: true, // WHY: Added to ensure accountant profile is available for audit context
    },
  })

  if (!user) {
    return errors.notFound('User')
  }

  // Security Gate: ADMINs cannot reset credentials of a SUPER_ADMIN
  if (session.user.role === 'ADMIN' && user.role === 'SUPER_ADMIN') {
    return errors.forbidden('Administrators cannot modify Super Administrator credentials.')
  }

  const updateData: Record<string, any> = {}
  const auditChanges: Record<string, any> = {}

  // 1. Process email reset
  if (newEmail) {
    const cleanEmail = newEmail.trim().toLowerCase()
    if (!cleanEmail.includes('@')) {
      return errors.validation({ errors: [{ path: ['newEmail'], message: 'Invalid email address' }] } as never)
    }

    // Ensure email is unique in the system
    const existing = await prisma.user.findFirst({
      where: {
        email: cleanEmail,
        id: { not: userId },
      },
    })
    if (existing) {
      return errors.validation({ errors: [{ path: ['newEmail'], message: 'Email address is already in use by another account' }] } as never)
    }

    updateData.email = cleanEmail
    auditChanges.email = cleanEmail
  }

  // 2. Process password reset
  if (newPassword) {
    if (newPassword.length < 8) {
      return errors.validation({ errors: [{ path: ['newPassword'], message: 'Password must be at least 8 characters long' }] } as never)
    }
    const passwordHash = await hash(newPassword, ARGON2_OPTIONS)
    updateData.passwordHash = passwordHash
    auditChanges.password = '[REDACTED]'
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Update the main User entity
      await tx.user.update({
        where: { id: userId },
        data: updateData,
      })

      // Sync role profiles
      if (newEmail) {
        const cleanEmail = newEmail.trim().toLowerCase()
        if (user.student) {
          await tx.student.update({
            where: { id: user.student.id },
            data: { email: cleanEmail },
          })
        }
        if (user.teacher) {
          await tx.teacher.update({
            where: { id: user.teacher.id },
            data: { email: cleanEmail },
          })
        }
        if (user.parent) {
          await tx.parent.update({
            where: { id: user.parent.id },
            data: { email: cleanEmail },
          })
        }
        if (user.guardian) {
          await tx.guardian.update({
            where: { id: user.guardian.id },
            data: { email: cleanEmail },
          })
        }
      }

      // Log the credentials mutation
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'UserCredentials',
          entityId: userId,
          changes: auditChanges,
        },
      })
    })

    return successResponse(null, { message: 'Credentials updated successfully' })
  } catch (err: any) {
    console.error('[CREDENTIALS_RESET_ERROR]', err)
    return errors.internal()
  }
}
