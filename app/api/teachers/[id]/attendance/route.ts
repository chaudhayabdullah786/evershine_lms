/**
 * GET  /api/teachers/[id]/attendance  — paginated attendance history, filterable by month/year
 * POST /api/teachers/[id]/attendance  — admin-owned HR attendance upsert
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
  paginatedResponse,
  createdResponse,
} from '@/lib/api-response'
import {
  markTeacherAttendanceSchema,
  teacherAttendanceQuerySchema,
} from '@/lib/validation/teacher'
import { ATTENDANCE_POLICY, SESSION_SHIFT_LABELS, SESSION_SHIFT_TIMES } from '@/lib/validation/shift'
import { timeToMinutes } from '@/lib/academic/engine'
import type { AttendanceStatus, Role, TeacherHrAttendanceStatus } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

type TeacherAttendanceMark = {
  status: AttendanceStatus
  hrStatus: TeacherHrAttendanceStatus
  checkInTime: Date | null
  lateMinutes: number
  penaltyAmount: number
  isPenaltyApplied: boolean
  gracePassUsed: boolean
  priorLateCount: number
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function minutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

async function resolveAttendanceMark(input: {
  teacher: { id: string; campusId: string; monthlySalary: unknown }
  date: Date
  shift: keyof typeof SESSION_SHIFT_TIMES
  status: AttendanceStatus
  checkInTime?: string
  penaltyAmount?: number
  isPenaltyApplied?: boolean
}): Promise<TeacherAttendanceMark> {
  const shiftRow = await prisma.shift.findUnique({ where: { code: input.shift } })
  const fallbackWindow = SESSION_SHIFT_TIMES[input.shift]
  const shiftStart = shiftRow?.startTime ?? fallbackWindow.start
  const grace = shiftRow?.lateGraceMinutes ?? ATTENDANCE_POLICY.defaultGraceMinutes

  const policy = await prisma.teacherPenaltyPolicy.findFirst({
    where: { OR: [{ campusId: input.teacher.campusId }, { campusId: null }], isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  let status = input.status
  let hrStatus: TeacherHrAttendanceStatus
  let checkInTime: Date | null = input.checkInTime ? new Date(input.checkInTime) : null
  let lateMinutes = 0
  let calculatedPenalty = 0
  let gracePassUsed = false
  let priorLateCount = 0

  if (status === 'ABSENT') {
    hrStatus = 'ABSENT'
    calculatedPenalty = policy ? Number(policy.leavePenaltyAmount) : 0
    checkInTime = null
  } else if (status === 'EXCUSED') {
    hrStatus = 'LEAVE'
    checkInTime = null
  } else {
    if (checkInTime) {
      const expectedStart = timeToMinutes(shiftStart)
      lateMinutes = Math.max(0, minutesFromDate(checkInTime) - expectedStart - grace)
    }

    hrStatus = lateMinutes > 0 || status === 'LATE' ? 'LATE' : 'PRESENT'
    status = hrStatus === 'LATE' ? 'LATE' : 'PRESENT'

    if (hrStatus === 'LATE') {
      const monthStart = new Date(input.date.getFullYear(), input.date.getMonth(), 1)
      priorLateCount = await prisma.teacherAttendance.count({
        where: {
          teacherId: input.teacher.id,
          hrStatus: 'LATE',
          date: { gte: monthStart, lt: input.date },
        },
      })

      gracePassUsed = priorLateCount < ATTENDANCE_POLICY.freeLatePasses
      if (!gracePassUsed && policy) {
        calculatedPenalty =
          policy.penaltyType === 'FIXED'
            ? policy.penaltyValue
            : ((Number(input.teacher.monthlySalary) || 0) * policy.penaltyValue) / 100

        const totalLateThisMonth = priorLateCount + 1
        if (policy.repeatMultiplier && totalLateThisMonth >= policy.lateThreshold) {
          calculatedPenalty *= policy.repeatMultiplier
        }
      }
    }
  }

  let penaltyAmount = input.penaltyAmount ?? calculatedPenalty
  if (input.isPenaltyApplied === false) penaltyAmount = 0

  return {
    status,
    hrStatus,
    checkInTime,
    lateMinutes,
    penaltyAmount,
    isPenaltyApplied: input.isPenaltyApplied ?? penaltyAmount > 0,
    gracePassUsed,
    priorLateCount,
  }
}

// ── GET /api/teachers/[id]/attendance ─────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'attendance', 'read')) return errors.forbidden()

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, campusId: true, userId: true, firstName: true, lastName: true },
  })
  if (!teacher) return errors.notFound('Teacher')

  if (session.user.role === 'TEACHER' && teacher.userId !== session.user.id) {
    return errors.forbidden()
  }

  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const { searchParams } = new URL(req.url)
  const parsed = teacherAttendanceQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { month, year, shift, page, limit } = parsed.data

  const where: Record<string, unknown> = { teacherId: id, ...(shift && { shift }) }
  if (month && year) {
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
    where.date = { gte: start, lte: end }
  } else if (year) {
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
    where.date = { gte: start, lte: end }
  }

  const [total, records] = await prisma.$transaction([
    prisma.teacherAttendance.count({ where }),
    prisma.teacherAttendance.findMany({
      where,
      orderBy: [{ date: 'desc' }, { shift: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        date: true,
        shift: true,
        status: true,
        hrStatus: true,
        checkInTime: true,
        lateMinutes: true,
        penaltyAmount: true,
        isPenaltyApplied: true,
        remarks: true,
        createdAt: true,
      },
    }),
  ])

  return paginatedResponse(records, { page, limit, total })
}

// ── POST /api/teachers/[id]/attendance ────────────────────────────────────────
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  if (!checkPermission(session.user.role as Role, 'attendance', 'create')) {
    return errors.forbidden()
  }

  if (session.user.role === 'TEACHER') {
    return errors.forbidden('Teachers cannot mark their own HR attendance')
  }

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: {
      id: true,
      campusId: true,
      isActive: true,
      userId: true,
      firstName: true,
      lastName: true,
      monthlySalary: true,
    },
  })
  if (!teacher) return errors.notFound('Teacher')
  if (!teacher.isActive) return errors.forbidden('Cannot mark attendance for an inactive teacher')

  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errors.badRequest('Invalid JSON body')
  }

  const parsed = markTeacherAttendanceSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { date, shift, status, remarks, checkInTime, penaltyAmount, isPenaltyApplied } = parsed.data
  const attendanceDate = new Date(`${date}T00:00:00.000Z`)

  const resolved = await resolveAttendanceMark({
    teacher,
    date: attendanceDate,
    shift,
    status,
    checkInTime,
    penaltyAmount,
    isPenaltyApplied,
  })

  const record = await prisma.$transaction(async (tx) => {
    const upserted = await tx.teacherAttendance.upsert({
      where: { teacherId_date_shift: { teacherId: id, date: attendanceDate, shift } },
      create: {
        teacherId: id,
        date: attendanceDate,
        shift,
        status: resolved.status,
        hrStatus: resolved.hrStatus,
        checkInTime: resolved.checkInTime,
        lateMinutes: resolved.lateMinutes,
        penaltyAmount: resolved.penaltyAmount,
        isPenaltyApplied: resolved.isPenaltyApplied,
        remarks: remarks ?? null,
      },
      update: {
        status: resolved.status,
        hrStatus: resolved.hrStatus,
        checkInTime: resolved.checkInTime,
        lateMinutes: resolved.lateMinutes,
        penaltyAmount: resolved.penaltyAmount,
        isPenaltyApplied: resolved.isPenaltyApplied,
        remarks: remarks ?? null,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'TeacherAttendance',
        entityId: upserted.id,
        changes: {
          teacherId: id,
          date,
          shift,
          requestedStatus: status,
          status: resolved.status,
          hrStatus: resolved.hrStatus,
          checkInTime: resolved.checkInTime?.toISOString() ?? null,
          lateMinutes: resolved.lateMinutes,
          penaltyAmount: resolved.penaltyAmount,
          isPenaltyApplied: resolved.isPenaltyApplied,
          gracePassUsed: resolved.gracePassUsed,
          priorLateCount: resolved.priorLateCount,
        },
      },
    })

    await tx.notification.create({
      data: {
        userId: teacher.userId,
        title: 'Attendance updated',
        message: `${dateKey(attendanceDate)} ${SESSION_SHIFT_LABELS[shift]} marked ${resolved.hrStatus}${resolved.lateMinutes > 0 ? ` (${resolved.lateMinutes} min late)` : ''}${resolved.penaltyAmount > 0 ? ` with Rs ${resolved.penaltyAmount.toFixed(0)} penalty` : ''}.`,
        type: 'ATTENDANCE_ALERT',
      },
    })

    return upserted
  })

  return createdResponse(
    { ...record, penaltyAmount: Number(record.penaltyAmount), gracePassUsed: resolved.gracePassUsed },
    `Attendance marked as ${resolved.hrStatus} for ${date}`
  )
}
