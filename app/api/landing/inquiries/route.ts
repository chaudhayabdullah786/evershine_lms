/**
 * POST /api/landing/inquiries — Submit a contact form inquiry (public, unauthenticated)
 * GET  /api/landing/inquiries — List inquiries (SUPER_ADMIN | ADMIN only)
 *
 * WHY separate from admissions: Visitors submitting a "Get in Touch" form
 * are not applicants. Their data is stored in a dedicated `LandingInquiry` table.
 *
 * Security:
 * - POST is rate-limited via IP (existing middleware catches at edge)
 * - Basic spam guard: rejects messages with >3 external URLs
 * - IP and userAgent stored server-side for spam analysis, never returned in public responses
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, paginatedResponse, createdResponse } from '@/lib/api-response'
import { inquirySchema } from '@/lib/validation/staff-application'
import { sendInquiryAckNotification, sendAdminInquiryAlert } from '@/lib/notifications'
import { ZodError } from 'zod'
import type { Role } from '@prisma/client'

// ── POST — Public submission ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = inquirySchema.parse(body)

    // Basic spam guard: reject messages containing excessive external URLs
    const urlCount = (validated.message.match(/https?:\/\//g) || []).length
    if (urlCount > 3) {
      return errors.badRequest('Message appears to be spam. Please remove excessive links and try again.')
    }

    // Extract metadata for spam detection (stored server-side only)
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = request.headers.get('user-agent') || null

    const inquiry = await prisma.landingInquiry.create({
      data: {
        name: validated.name,
        phone: validated.phone,
        email: validated.email || null,
        message: validated.message,
        source: 'CONTACT_FORM',
        status: 'NEW',
        ipAddress,
        userAgent,
      },
    })

    // Non-fatal notifications — inquiry is already persisted
    try {
      if (validated.email) {
        await sendInquiryAckNotification(validated.email, validated.name)
      }
      await sendAdminInquiryAlert(validated.name, validated.phone, validated.message)
    } catch (_notifErr) {
      console.warn('[INQUIRY_SUBMIT] notification send failed', _notifErr)
    }

    return createdResponse(
      { id: inquiry.id, createdAt: inquiry.createdAt },
      'Your message has been sent. We will get back to you soon.'
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return errors.validation(error)
    }
    console.error('[INQUIRY_POST]', error)
    return errors.internal()
  }
}

// ── GET — Admin paginated list ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const status = searchParams.get('status') || undefined
  const q = searchParams.get('q') || undefined

  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') {
    where.status = status
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { message: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [inquiries, total] = await Promise.all([
    prisma.landingInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        message: true,
        source: true,
        status: true,
        adminReply: true,
        repliedAt: true,
        createdAt: true,
        // WHY: ipAddress and userAgent excluded from response — internal use only
      },
    }),
    prisma.landingInquiry.count({ where }),
  ])

  return paginatedResponse(inquiries, { page, limit, total })
}
