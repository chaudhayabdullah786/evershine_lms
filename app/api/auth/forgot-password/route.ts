/**
 * POST /api/auth/forgot-password
 * Public endpoint for requesting a password reset email.
 */

import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const requestSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: ['email'], message: 'Invalid JSON payload' }] } as never)
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation(parsed.error)
  }

  const email = parsed.data.email.trim().toLowerCase()

  try {
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
    })

    if (user) {
      const token = randomUUID()
      const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetTokenExpiry: expiry,
        },
      })

      await sendPasswordResetEmail(email, token).catch((err) => {
        console.error('[FORGOT_PASSWORD_EMAIL_ERROR]', err)
      })
    }

    return successResponse(
      { message: 'If the account exists, password reset instructions have been sent.' },
      { status: 200 }
    )
  } catch (err) {
    console.error('[FORGOT_PASSWORD_ERROR]', err)
    return errors.internal()
  }
}
