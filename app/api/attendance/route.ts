/**
 * POST /api/attendance  — submit batch attendance
 * GET  /api/attendance  — query attendance records
 *
 * WHY $transaction for batch submit: 30-40 attendance records per class.
 * A partial write (some students marked, connection drops) would give a
 * false picture of attendance on that day. All-or-nothing is mandatory.
 *
 * WHY duplicate check before transaction: Prevents teachers from accidentally
 * submitting twice. Returns 409 with the existing records so UI can show them.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse, paginatedResponse } from '@/lib/api-response'
import { submitAttendanceSchema, attendanceQuerySchema } from '@/lib/validation/attendance'
import type { Role } from '@prisma/client'
import { guardLegacyClassMutation } from '@/lib/academic/legacy-guard'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'attendance', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = attendanceQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { page, limit, classId, studentId, shift, date, startDate, endDate, status } = parsed.data

  const where = {
    ...(classId && { classId }),
    ...(studentId && { studentId }),
    ...(shift && { shift }),
    ...(status && { status }),
    ...(date && { date: new Date(date) }),
    ...((startDate || endDate) && {
      date: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  }

  const [total, records] = await prisma.$transaction([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, registrationNumber: true, rollNumber: true },
        },
      },
    }),
  ])

  return paginatedResponse(records, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role as Role
  const legacyBlocked = guardLegacyClassMutation(request, 'attendance', role)
  if (legacyBlocked) return legacyBlocked
  if (!checkPermission(role, 'attendance', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = submitAttendanceSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { classId, date, shift, records } = parsed.data
  const attendanceDate = new Date(date)

  // Verify class exists
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true, shift: true } })
  if (!cls) return errors.notFound('Class')

  const resolvedShift = shift ?? cls.shift

  // Check for existing attendance on this date for this class + shift
  const existingCount = await prisma.attendance.count({
    where: { classId, date: attendanceDate, shift: resolvedShift },
  })
  if (existingCount > 0) {
    return errors.conflict(
      `Attendance for ${cls.name} (${resolvedShift}) on ${date} has already been submitted. Delete existing records before resubmitting.`
    )
  }

  // WHY createMany inside $transaction: Faster than individual creates.
  // createMany does not trigger nested queries, making it O(1) DB round trips.
  await prisma.$transaction(async (tx) => {
    await tx.attendance.createMany({
      data: records.map((r) => ({
        studentId: r.studentId,
        classId,
        date: attendanceDate,
        shift: resolvedShift,
        status: r.status,
        markedBy: session.user.id,
        remarks: r.remarks ?? null,
      })),
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Attendance',
        entityId: classId,
        changes: { date, shift: resolvedShift, recordCount: records.length },
      },
    })
  })

  return successResponse(
    { classId, date, recordCount: records.length },
    `Attendance recorded for ${records.length} students`
  )
}
