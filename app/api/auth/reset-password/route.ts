/**
 * POST /api/auth/reset-password
 * Public endpoint for updating a user's password using a reset token.
 */

import { NextRequest } from 'next/server'
import { hash } from '@node-rs/argon2'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const requestSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
})

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: ['token'], message: 'Invalid JSON payload' }] } as never)
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation(parsed.error)
  }

  const { token, password } = parsed.data

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    })

    if (!user) {
      return errors.validation({ errors: [{ path: ['token'], message: 'Reset token is invalid or has expired' }] } as never)
    }

    const passwordHash = await hash(password, ARGON2_OPTIONS)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    })

    return successResponse({ message: 'Password reset successfully. You can now sign in with your new password.' })
  } catch (err) {
    console.error('[RESET_PASSWORD_ERROR]', err)
    return errors.internal()
  }
}
