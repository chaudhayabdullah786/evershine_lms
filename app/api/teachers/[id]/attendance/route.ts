/**
 * GET  /api/teachers/[id]/attendance  — paginated attendance history, filterable by month/year
 * POST /api/teachers/[id]/attendance  — mark or upsert a single day's attendance
 *
 * WHY upsert on POST: Prevents duplicate-key violations when re-marking
 * attendance for an already-marked date. Admin corrections are the common
 * case — overwriting is intentional and audit-logged.
 *
 * RBAC:
 *   GET  — SUPER_ADMIN, ADMIN, and the teacher themselves (row-level scoped)
 *   POST — SUPER_ADMIN, ADMIN only (teachers cannot self-mark)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import {
  errors,
  successResponse,
  paginatedResponse,
  createdResponse,
} from '@/lib/api-response'
import {
  markTeacherAttendanceSchema,
  teacherAttendanceQuerySchema,
} from '@/lib/validation/teacher'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ── GET /api/teachers/[id]/attendance ─────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'attendance', 'read')) return errors.forbidden()

  const { id } = await params

  // Verify teacher exists and is accessible
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, campusId: true, userId: true, firstName: true, lastName: true },
  })
  if (!teacher) return errors.notFound('Teacher')

  // Row-level scoping: teachers may only see their own attendance
  if (session.user.role === 'TEACHER' && teacher.userId !== session.user.id) {
    return errors.forbidden()
  }

  // Campus scoping for ADMIN
  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const { searchParams } = new URL(req.url)
  const parsed = teacherAttendanceQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { month, year, shift, page, limit } = parsed.data

  // Build date range filter
  const where: Record<string, unknown> = { teacherId: id, ...(shift && { shift }) }
  if (month && year) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59, 999)
    where.date = { gte: start, lte: end }
  } else if (year) {
    const start = new Date(year, 0, 1)
    const end = new Date(year, 11, 31, 23, 59, 59, 999)
    where.date = { gte: start, lte: end }
  }

  const [total, records] = await prisma.$transaction([
    prisma.teacherAttendance.count({ where }),
    prisma.teacherAttendance.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        date: true,
        shift: true,
        status: true,
        remarks: true,
        createdAt: true,
      },
    }),
  ])

  // NOTE: stats (present/absent/late counts) are intentionally omitted from
  // the server response — the calendar UI computes them locally from the
  // returned records, which is correct for the records currently in view.
  return paginatedResponse(records, { page, limit, total })
}

// ── POST /api/teachers/[id]/attendance ────────────────────────────────────────
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  // Only admin-level roles can mark teacher attendance
  if (!checkPermission(session.user.role as Role, 'attendance', 'create')) {
    return errors.forbidden()
  }

  // Extra restriction: Teachers cannot mark their own attendance
  if (session.user.role === 'TEACHER') {
    return errors.forbidden('Teachers cannot mark their own attendance')
  }

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, campusId: true, isActive: true },
  })
  if (!teacher) return errors.notFound('Teacher')
  if (!teacher.isActive) return errors.forbidden('Cannot mark attendance for an inactive teacher')

  // Campus scoping for ADMIN
  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = markTeacherAttendanceSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { date, shift, status, remarks } = parsed.data

  // Build a midnight UTC DateTime from the YYYY-MM-DD string
  // WHY: Prisma stores as DateTime — normalising to midnight prevents
  // duplicate records caused by minor timestamp drift.
  const attendanceDate = new Date(`${date}T00:00:00.000Z`)

  const record = await prisma.$transaction(async (tx) => {
    const upserted = await tx.teacherAttendance.upsert({
      where: { teacherId_date_shift: { teacherId: id, date: attendanceDate, shift } },
      create: {
        teacherId: id,
        date: attendanceDate,
        shift,
        status,
        remarks: remarks ?? null,
      },
      update: {
        status,
        remarks: remarks ?? null,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'TeacherAttendance',
        entityId: upserted.id,
        changes: { teacherId: id, date, shift, status },
      },
    })

    return upserted
  })

  return createdResponse(record, `Attendance marked as ${status} for ${date}`)
}
