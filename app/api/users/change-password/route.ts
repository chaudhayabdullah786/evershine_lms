/**
 * POST /api/users/change-password — Allow any logged-in user to change their own password securely
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { verify, hash } from '@node-rs/argon2'
import { changePasswordSchema } from '@/lib/validation/user'

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return errors.unauthorized()
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON payload' }] } as never)
  }

  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation({
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    } as never)
  }

  const { currentPassword, newPassword } = parsed.data

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      return errors.notFound('User')
    }

    // Verify current password hash
    const isPasswordCorrect = await verify(user.passwordHash, currentPassword)
    if (!isPasswordCorrect) {
      return errors.validation({
        errors: [{ path: ['currentPassword'], message: 'Incorrect current password' }],
      } as never)
    }

    // Hash the new password using Argon2
    const passwordHash = await hash(newPassword, ARGON2_OPTIONS)

    await prisma.$transaction(async (tx) => {
      // Update User Password
      await tx.user.update({
        where: { id: session.user.id },
        data: { passwordHash },
      })

      // Log to Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'UserPassword',
          entityId: session.user.id,
          changes: { password: '[REDACTED_CHANGED]' },
        },
      })
    })

    return successResponse(null, { message: 'Password updated successfully' })
  } catch (err: any) {
    console.error('[PASSWORD_CHANGE_ERROR]', err)
    return errors.internal()
  }
}
