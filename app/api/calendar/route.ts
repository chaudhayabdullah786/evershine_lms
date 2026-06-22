/**
 * GET  /api/calendar  — list calendar events filtered by date range and campus
 * POST /api/calendar  — create an event (Admin/Super Admin only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const querySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  eventType: z.enum(['Holiday', 'Exam', 'Sports', 'Ceremony', 'Other']),
  campusId: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'calendar', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { startDate, endDate, page, limit } = parsed.data

  const where: Record<string, any> = {
    isActive: true,
  }

  if (startDate || endDate) {
    where.startDate = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate + 'T23:59:59') }),
    }
  }

  // Scoping: Students, parents, teachers, and accountants only see events for all campuses (null)
  // or their own specific campus. Super Admins and Admins can see all.
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    const campusId = session.user.campusId
    if (campusId) {
      where.OR = [
        { campusId: null },
        { campusId: campusId },
      ]
    }
  }

  const [total, events] = await prisma.$transaction([
    prisma.calendarEvent.count({ where }),
    prisma.calendarEvent.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        eventType: true,
        campusId: true,
      },
    }),
  ])

  return paginatedResponse(events, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'calendar', 'create')) return errors.forbidden()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { title, description, startDate, endDate, eventType, campusId } = parsed.data

  const event = await prisma.$transaction(async (tx) => {
    const e = await tx.calendarEvent.create({
      data: {
        title,
        description: description ?? null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        eventType,
        campusId: campusId ?? null,
        createdBy: session.user.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        eventType: true,
        campusId: true,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'CalendarEvent',
        entityId: e.id,
        changes: parsed.data,
      },
    })

    return e
  })

  return createdResponse(event, 'Event created successfully')
}
