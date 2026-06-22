/**
 * GET  /api/announcements — list active announcements (role-filtered)
 * POST /api/announcements — create announcement (Admin/Super Admin only)
 *
 * WHY fire-and-forget email: Email dispatch is a side-effect, not the primary
 * resource creation. If Resend is unavailable, we still create the announcement.
 * Blocking the HTTP response on email delivery would degrade UX for no gain.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { sendEmail } from '@/lib/email'
import { logAudit } from '@/lib/audit-logger'
import { z } from 'zod'
import type { Prisma, Role } from '@prisma/client'

const createSchema = z.object({
  title: z.string().min(2).max(200),
  content: z.string().min(5),
  targetRole: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'announcements', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit } = parsed.data

  const now = new Date()
  const where = {
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    AND: [
      {
        OR: [
          { targetRole: null },
          { targetRole: session.user.role },
        ],
      },
    ],
  }

  const [total, announcements] = await prisma.$transaction([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        content: true,
        targetRole: true,
        isActive: true,
        publishedAt: true,
        expiresAt: true,
        createdBy: true,
      },
    }),
  ])

  return paginatedResponse(announcements, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'announcements', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { title, content, targetRole, expiresAt } = parsed.data

  const announcement = await prisma.$transaction(async (tx) => {
    const createdAnnouncement = await tx.announcement.create({
      data: {
        title,
        content,
        targetRole: targetRole ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        publishedAt: new Date(),
        createdBy: session.user.id,
      },
      select: { id: true, title: true },
    })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Announcement',
      entityId: createdAnnouncement.id,
      changes: {
        title,
        targetRole: targetRole ?? null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      },
      request,
    })

    return createdAnnouncement
  })

  // WHY fire-and-forget: email dispatch is a side-effect.
  // Announcement is already persisted — don't block the response on email delivery.
  sendAnnouncementEmails({ title, content, targetRole: targetRole ?? null }).catch((err) =>
    console.error('[ANNOUNCEMENT_EMAIL_ERROR]', err)
  )

  return createdResponse(announcement, 'Announcement published successfully')
}

// ── Email Dispatch ─────────────────────────────────────────────────────────────

async function sendAnnouncementEmails({
  title,
  content,
  targetRole,
}: {
  title: string
  content: string
  targetRole: string | null
}) {
  // Query users with verified emails matching the target role
  const where: Prisma.UserWhereInput = {
    isActive: true,
    email: { not: null },
    ...(targetRole ? { role: targetRole as Role } : {}),
  }

  const users = await prisma.user.findMany({
    where,
    select: { email: true },
    take: 500, // cap at 500 recipients per announcement
  })

  const recipients = users.map((u) => u.email).filter(Boolean) as string[]
  if (recipients.length === 0) return

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Evershaheen Academy'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'
  const audience = targetRole ? targetRole.charAt(0) + targetRole.slice(1).toLowerCase() + 's' : 'All Staff & Students'

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;border-radius:12px;overflow:hidden;">
      <div style="background:#1E40AF;padding:24px 32px;">
        <h1 style="color:white;margin:0;font-size:20px;">${appName}</h1>
        <p style="color:#BFDBFE;margin:4px 0 0;font-size:13px;">📢 New Announcement</p>
      </div>
      <div style="padding:32px;background:white;">
        <h2 style="color:#111827;font-size:18px;margin:0 0 16px;">${title}</h2>
        <p style="color:#374151;line-height:1.7;white-space:pre-line;">${content}</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
        <p style="color:#6B7280;font-size:12px;">
          This announcement was addressed to: <strong>${audience}</strong><br/>
          Published: ${new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <a href="${appUrl}/dashboard" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1E40AF;color:white;text-decoration:none;border-radius:8px;font-size:14px;">
          View on Portal →
        </a>
      </div>
      <div style="padding:16px 32px;background:#F3F4F6;text-align:center;">
        <p style="color:#9CA3AF;font-size:11px;margin:0;">${appName} · You received this because you are registered on the LMS</p>
      </div>
    </div>
  `

  // Send in batches of 50 to avoid rate limits
  const BATCH = 50
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH)
    await sendEmail({ to: batch, subject: `📢 ${title} — ${appName}`, html })
  }
}

