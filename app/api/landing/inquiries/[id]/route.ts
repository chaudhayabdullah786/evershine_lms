/**
 * GET   /api/landing/inquiries/[id] — Fetch inquiry detail (auto-transitions NEW→SEEN)
 * PATCH /api/landing/inquiries/[id] — Admin actions: reply, resolve, spam
 *
 * RBAC: SUPER_ADMIN | ADMIN only.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { inquiryActionSchema } from '@/lib/validation/staff-application'
import { sendInquiryReplyNotification } from '@/lib/notifications'
import { ZodError } from 'zod'
import type { Role } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ── GET — Detail with auto-status transition ──────────────────────────────────

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) return errors.forbidden()

  const { id } = await context.params

  const inquiry = await prisma.landingInquiry.findUnique({ where: { id } })
  if (!inquiry) return errors.notFound('Inquiry')

  // Auto-transition NEW → SEEN on first admin open
  if (inquiry.status === 'NEW') {
    await prisma.landingInquiry.update({
      where: { id },
      data: { status: 'SEEN' },
    })
    inquiry.status = 'SEEN'
  }

  // Strip internal fields before returning
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ipAddress: _ip, userAgent: _ua, ...safeInquiry } = inquiry

  return successResponse(safeInquiry)
}

// ── PATCH — Admin actions ─────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) return errors.forbidden()

  const { id } = await context.params

  try {
    const body = await request.json()
    const validated = inquiryActionSchema.parse(body)

    const inquiry = await prisma.landingInquiry.findUnique({ where: { id } })
    if (!inquiry) return errors.notFound('Inquiry')

    switch (validated.action) {
      case 'reply': {
        const updated = await prisma.landingInquiry.update({
          where: { id },
          data: {
            status: 'REPLIED',
            adminReply: validated.replyText,
            repliedAt: new Date(),
            repliedBy: session.user.id,
          },
        })

        // Send reply email if visitor provided email
        if (inquiry.email) {
          try {
            await sendInquiryReplyNotification(inquiry.email, inquiry.name, validated.replyText)
          } catch (_err) {
            console.warn('[INQUIRY_REPLY] email send failed', _err)
          }
        }

        return successResponse(updated, 'Reply sent successfully')
      }

      case 'resolve': {
        const updated = await prisma.landingInquiry.update({
          where: { id },
          data: { status: 'RESOLVED' },
        })
        return successResponse(updated, 'Inquiry marked as resolved')
      }

      case 'spam': {
        const updated = await prisma.landingInquiry.update({
          where: { id },
          data: { status: 'SPAM' },
        })
        return successResponse(updated, 'Inquiry marked as spam')
      }
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return errors.validation(error)
    }
    console.error('[INQUIRY_PATCH]', error)
    return errors.internal()
  }
}
