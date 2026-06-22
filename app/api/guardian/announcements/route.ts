/**
 * GET /api/guardian/announcements
 * Paginated announcements scoped to guardians.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, paginatedResponse } from '@/lib/api-response'
import { guardianAnnouncementQuerySchema } from '@/lib/validation/guardian'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = guardianAnnouncementQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { page, limit } = parsed.data
  const now = new Date()

  const where = {
    isActive: true,
    AND: [
      {
        OR: [
          { targetRole: null },
          { targetRole: 'GUARDIAN' },
        ],
      },
      {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    ],
  }

  const [total, announcements] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { isPinned: 'desc', createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        content: true,
        isPinned: true,
        priority: true,
        createdAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  return paginatedResponse(announcements, { page, limit, total })
}
