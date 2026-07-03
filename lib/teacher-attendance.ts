/**
 * lib/teacher-attendance.ts
 *
 * Shared domain logic for teacher HR attendance.
 *
 * WHY a shared lib: The `resolveAttendanceMark` function was previously
 * inlined in the per-teacher PATCH route. The new bulk-mark endpoint needs
 * the same policy calculation. Extracting here prevents duplication and
 * ensures both routes are always in sync with penalty policy rules.
 *
 * This module is pure domain logic — no HTTP, no Next.js specifics.
 */

import { prisma } from '@/lib/prisma'
import { ATTENDANCE_POLICY, SESSION_SHIFT_TIMES } from '@/lib/validation/shift'
import { timeToMinutes } from '@/lib/academic/engine'
import type { AttendanceStatus, TeacherHrAttendanceStatus } from '@prisma/client'
import type { SessionShift } from '@/lib/validation/shift'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TeacherAttendanceMark = {
  status: AttendanceStatus
  hrStatus: TeacherHrAttendanceStatus
  checkInTime: Date | null
  lateMinutes: number
  penaltyAmount: number
  isPenaltyApplied: boolean
  gracePassUsed: boolean
  priorLateCount: number
}

export type ResolveAttendanceMarkInput = {
  teacher: { id: string; campusId: string; monthlySalary: unknown }
  date: Date
  shift: SessionShift
  status: AttendanceStatus
  checkInTime?: string
  penaltyAmount?: number
  isPenaltyApplied?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Resolves the final attendance mark for a teacher, applying penalty policy.
 *
 * WHY: Penalty calculation requires DB reads (shift config, campus policy,
 * prior late count) that must be consistent across both per-teacher and bulk
 * mark paths. Centralising here guarantees that both routes always use the
 * same policy engine.
 *
 * TRADEOFF: Each call makes up to 3 DB reads. For bulk marking, callers should
 * batch-load shift/policy ahead of time and pass them in if N > 10 teachers,
 * but for typical campus sizes (< 50) per-call is acceptable.
 */
export async function resolveAttendanceMark(
  input: ResolveAttendanceMarkInput
): Promise<TeacherAttendanceMark> {
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
    // PRESENT or LATE — compute lateness from check-in time
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
            ? Number(policy.penaltyValue)
            : ((Number(input.teacher.monthlySalary) || 0) * Number(policy.penaltyValue)) / 100

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
