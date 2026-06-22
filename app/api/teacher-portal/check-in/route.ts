import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { SESSION_SHIFT_LABELS, SESSION_SHIFT_TIMES, ATTENDANCE_POLICY } from '@/lib/validation/shift'
import type { SessionShift } from '@/lib/validation/shift'

/**
 * GET /api/teacher-portal/check-in
 *
 * Returns the teacher's shift info, today's check-in status, recent
 * attendance history, and monthly attendance statistics (for the
 * professional HR dashboard).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden()

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true, firstName: true, lastName: true, campusId: true },
  })
  if (!teacher) return errors.notFound('Teacher profile')

  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [shifts, todayRecords, monthRecords] = await Promise.all([
    prisma.shift.findMany({ orderBy: { startTime: 'asc' } }),
    prisma.teacherAttendance.findMany({
      where: { teacherId: teacher.id, date: today },
      orderBy: { shift: 'asc' },
    }),
    prisma.teacherAttendance.findMany({
      where: {
        teacherId: teacher.id,
        date: { gte: monthStart },
      },
      orderBy: [{ date: 'desc' }, { shift: 'asc' }],
      take: 60,
    }),
  ])

  // ── Build shift metadata ───────────────────────────────────────────────
  const shiftMeta = (['MORNING', 'EVENING', 'NIGHT'] as SessionShift[]).map((code) => {
    const row = shifts.find((s) => s.code === code)
    const times = SESSION_SHIFT_TIMES[code]
    const record = todayRecords.find((r) => r.shift === code)
    return {
      code,
      label: SESSION_SHIFT_LABELS[code],
      startTime: row?.startTime ?? times.start,
      endTime: row?.endTime ?? times.end,
      lateGraceMinutes: row?.lateGraceMinutes ?? ATTENDANCE_POLICY.defaultGraceMinutes,
      today: record
        ? {
            id: record.id,
            checkInTime: record.checkInTime,
            status: record.status,
            hrStatus: record.hrStatus,
            lateMinutes: record.lateMinutes,
            penaltyAmount: Number(record.penaltyAmount),
          }
        : null,
    }
  })

  // ── Monthly summary statistics ─────────────────────────────────────────
  // WHY computed server-side: Prevents client from having to iterate all
  // history rows just to render the summary strip.
  const monthlyStats = {
    present: monthRecords.filter((r) => r.hrStatus === 'PRESENT').length,
    late: monthRecords.filter((r) => r.hrStatus === 'LATE').length,
    absent: monthRecords.filter((r) => r.hrStatus === 'ABSENT').length,
    leave: monthRecords.filter((r) => r.hrStatus === 'LEAVE').length,
    totalPenalty: monthRecords.reduce((sum, r) => sum + Number(r.penaltyAmount), 0),
    gracePassesUsed: monthRecords.filter(
      (r) => r.hrStatus === 'LATE' && Number(r.penaltyAmount) === 0
    ).length,
    gracePassesAllowed: ATTENDANCE_POLICY.freeLatePasses,
  }

  return successResponse({
    teacher: { id: teacher.id, name: `${teacher.firstName} ${teacher.lastName}` },
    defaultShift: 'MORNING' as const,
    shifts: shiftMeta,
    monthlyStats,
    history: monthRecords.map((r) => ({
      id: r.id,
      date: r.date,
      shift: r.shift,
      status: r.status,
      hrStatus: r.hrStatus,
      lateMinutes: r.lateMinutes,
      penaltyAmount: Number(r.penaltyAmount),
      checkInTime: r.checkInTime,
      remarks: r.remarks,
    })),
  })
}
