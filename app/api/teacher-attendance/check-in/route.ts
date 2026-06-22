import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { teacherCheckInSchema } from '@/lib/validation/academic'
import { timeToMinutes } from '@/lib/academic/engine'
import { SESSION_SHIFT_TIMES, ATTENDANCE_POLICY } from '@/lib/validation/shift'
import type { Role } from '@prisma/client'

/**
 * POST /api/teacher-attendance/check-in
 *
 * Records a teacher's shift check-in with the "30-minute grace, 1 free
 * late pass per month" policy:
 *
 *   1. Grace window: 30 min after shift start (configurable via ATTENDANCE_POLICY).
 *   2. First late arrival in a calendar month: recorded as LATE, penalty = 0.
 *   3. Second+ late arrival: full penalty applied from TeacherPenaltyPolicy.
 *
 * WHY upsert: If the teacher re-opens the page and clicks check-in again
 * (e.g. accidental double-tap), the upsert idempotently updates instead of
 * creating a duplicate record.
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  const parsed = teacherCheckInSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const teacher = await prisma.teacher.findUnique({ where: { id: parsed.data.teacherId } })
  if (!teacher) return errors.notFound('Teacher')

  // ── Authorization ─────────────────────────────────────────────────────
  if (session.user.role === 'TEACHER') {
    const own = await prisma.teacher.findUnique({ where: { userId: session.user.id } })
    if (!own || own.id !== teacher.id) return errors.forbidden()
  } else {
    const denied = requirePermission(session.user.role as Role, 'teacher_penalties', 'read')
    if (denied) return denied
  }

  // ── Shift timing resolution ───────────────────────────────────────────
  const shiftRow = await prisma.shift.findUnique({ where: { code: parsed.data.shift } })
  const window = SESSION_SHIFT_TIMES[parsed.data.shift]
  const shiftStart = shiftRow?.startTime ?? window.start
  const grace = shiftRow?.lateGraceMinutes ?? ATTENDANCE_POLICY.defaultGraceMinutes

  // ── Calculate lateness ────────────────────────────────────────────────
  const now = parsed.data.checkInTime ? new Date(parsed.data.checkInTime) : new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const checkInMinutes = now.getHours() * 60 + now.getMinutes()
  const expectedStart = timeToMinutes(shiftStart)
  const lateMinutes = Math.max(0, checkInMinutes - expectedStart - grace)

  // ── Count prior LATE arrivals this month (excluding today) ────────────
  // WHY exclude today: If the teacher is re-checking-in on the same day
  // (upsert scenario), we don't want to double-count today's own record.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const priorLateCount = await prisma.teacherAttendance.count({
    where: {
      teacherId: teacher.id,
      hrStatus: 'LATE',
      date: { gte: monthStart, lt: today },
    },
  })

  // ── Apply penalty policy ──────────────────────────────────────────────
  // POLICY: 1 free late pass per month. First late = warning only.
  //         Second+ late = penalty from TeacherPenaltyPolicy.
  const policy = await prisma.teacherPenaltyPolicy.findFirst({
    where: { OR: [{ campusId: teacher.campusId }, { campusId: null }], isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  let penaltyAmount = 0
  let hrStatus: 'PRESENT' | 'LATE' = 'PRESENT'
  const isFirstLateThisMonth = priorLateCount < ATTENDANCE_POLICY.freeLatePasses

  if (lateMinutes > 0) {
    hrStatus = 'LATE'

    if (!isFirstLateThisMonth && policy) {
      // Second+ late arrival → full penalty
      penaltyAmount =
        policy.penaltyType === 'FIXED'
          ? policy.penaltyValue
          : ((Number(teacher.monthlySalary) || 0) * policy.penaltyValue) / 100

      // Escalation multiplier for repeated offences beyond threshold
      const totalLateThisMonth = priorLateCount + 1
      if (policy.repeatMultiplier && totalLateThisMonth >= policy.lateThreshold) {
        penaltyAmount *= policy.repeatMultiplier
      }
    }
    // First late → penaltyAmount stays 0 (grace pass consumed)
  }

  // ── Persist record (upsert for idempotency) ───────────────────────────
  const record = await prisma.$transaction(async (tx) => {
    const row = await tx.teacherAttendance.upsert({
      where: {
        teacherId_date_shift: {
          teacherId: teacher.id,
          date: today,
          shift: parsed.data.shift,
        },
      },
      create: {
        teacherId: teacher.id,
        date: today,
        shift: parsed.data.shift,
        status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
        checkInTime: now,
        hrStatus,
        lateMinutes,
        penaltyAmount,
        isPenaltyApplied: penaltyAmount > 0,
      },
      update: {
        checkInTime: now,
        status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
        hrStatus,
        lateMinutes,
        penaltyAmount,
        isPenaltyApplied: penaltyAmount > 0,
      },
    })

    // Audit trail
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CHECK_IN',
        entityType: 'TeacherAttendance',
        entityId: row.id,
        changes: {
          lateMinutes,
          penaltyAmount,
          hrStatus,
          gracePassUsed: lateMinutes > 0 && isFirstLateThisMonth,
          priorLateCount,
        },
      },
    })

    // ── Notifications ─────────────────────────────────────────────────
    if (lateMinutes > 0 && isFirstLateThisMonth) {
      // Grace pass consumed — warning only
      await tx.notification.create({
        data: {
          userId: teacher.userId,
          title: 'Monthly grace pass used',
          message: `You arrived ${lateMinutes} min late. Your 1 free late pass for this month has been used. Any further late arrivals will incur penalty charges.`,
          type: 'ATTENDANCE_ALERT',
        },
      })
    } else if (penaltyAmount > 0) {
      // Penalty applied
      await tx.notification.create({
        data: {
          userId: teacher.userId,
          title: 'Late arrival — penalty applied',
          message: `You were ${lateMinutes} min late. Penalty: Rs ${penaltyAmount.toFixed(0)}. This is late arrival #${priorLateCount + 1} this month.`,
          type: 'ATTENDANCE_ALERT',
        },
      })
    }

    return row
  })

  return successResponse({
    ...record,
    gracePassUsed: lateMinutes > 0 && isFirstLateThisMonth,
    priorLateCount,
  })
}
