/**
 * GET  /api/teachers/attendance  — list all campus teachers with today's attendance for a date/shift
 * POST /api/teachers/attendance  — bulk-mark attendance for multiple teachers in one transaction
 *
 * RBAC: SUPER_ADMIN and ADMIN only. TEACHER role blocked explicitly.
 *
 * WHY a campus-level bulk endpoint:
 *   The per-teacher endpoint (/api/teachers/[id]/attendance) requires navigating
 *   into each teacher's record individually. For a campus with 20-50 teachers,
 *   this is impractical for daily roll-call. This endpoint returns all teachers
 *   in the admin's campus with their attendance status in one query, and accepts
 *   an array of marks to upsert in a single transaction.
 *
 * Security:
 *   - ADMIN: scoped to session.user.campusId — cross-campus teacher IDs are
 *     rejected before any write occurs.
 *   - SUPER_ADMIN: can access any campus; campusId query param filters results.
 *   - No TEACHER access — they are blocked at the checkPermission level AND
 *     with an explicit role check.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { z } from 'zod'
import { sessionShiftSchema, SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import { resolveAttendanceMark } from '@/lib/teacher-attendance'
import type { Role, AttendanceStatus } from '@prisma/client'
import type { SessionShift } from '@/lib/validation/shift'

// ── Validation schemas ────────────────────────────────────────────────────────

const getQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  shift: sessionShiftSchema,
  campusId: z.string().cuid().optional(), // SUPER_ADMIN only — ignored for ADMIN
})

const bulkMarkRecordSchema = z.object({
  teacherId: z.string().cuid('Invalid teacherId'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  shift: sessionShiftSchema,
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  checkInTime: z.string().optional(),  // ISO datetime string
  remarks: z.string().max(500).optional().nullable(),
  penaltyAmount: z.number().min(0).optional(),
  isPenaltyApplied: z.boolean().optional(),
})

const bulkMarkSchema = z.object({
  records: z.array(bulkMarkRecordSchema).min(1).max(200),
})

// ── GET /api/teachers/attendance ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'attendance', 'read')) {
    return errors.forbidden()
  }
  // Teachers cannot access campus-level attendance management
  if (session.user.role === 'TEACHER') return errors.forbidden()

  const { searchParams } = new URL(req.url)
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { date, shift, campusId: campusIdParam } = parsed.data

  // Determine which campus to query
  // ADMIN: always their own campus. SUPER_ADMIN: campusId param or all.
  let campusFilter: string | undefined
  if (session.user.role === 'ADMIN') {
    if (!session.user.campusId) return errors.forbidden('Admin has no assigned campus')
    campusFilter = session.user.campusId
  } else {
    campusFilter = campusIdParam // undefined = all campuses for SUPER_ADMIN
  }

  const queryDate = new Date(`${date}T00:00:00.000Z`)

  // Fetch all active teachers in campus (or all campuses for SUPER_ADMIN)
  const teachers = await prisma.teacher.findMany({
    where: {
      isActive: true,
      ...(campusFilter ? { campusId: campusFilter } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      designation: true,
      profilePicture: true,
      campusId: true,
      campus: { select: { name: true, code: true } },
      monthlySalary: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  if (teachers.length === 0) {
    return successResponse({ teachers: [], date, shift })
  }

  // Fetch all attendance records for these teachers on the given date+shift
  const teacherIds = teachers.map((t) => t.id)
  const attendanceRecords = await prisma.teacherAttendance.findMany({
    where: {
      teacherId: { in: teacherIds },
      date: queryDate,
      shift,
    },
    select: {
      id: true,
      teacherId: true,
      status: true,
      hrStatus: true,
      checkInTime: true,
      lateMinutes: true,
      penaltyAmount: true,
      isPenaltyApplied: true,
      remarks: true,
      createdAt: true,
    },
  })

  // Index records by teacherId for O(1) lookup
  const recordMap = new Map(attendanceRecords.map((r) => [r.teacherId, r]))

  const result = teachers.map((t) => {
    const record = recordMap.get(t.id) ?? null
    return {
      id: t.id,
      employeeId: t.employeeId,
      firstName: t.firstName,
      lastName: t.lastName,
      designation: t.designation,
      profilePicture: t.profilePicture,
      campusId: t.campusId,
      campus: t.campus,
      attendance: record
        ? {
            id: record.id,
            status: record.status,
            hrStatus: record.hrStatus,
            checkInTime: record.checkInTime,
            lateMinutes: record.lateMinutes,
            penaltyAmount: Number(record.penaltyAmount),
            isPenaltyApplied: record.isPenaltyApplied,
            remarks: record.remarks,
            createdAt: record.createdAt,
          }
        : null,
    }
  })

  const summary = {
    total: result.length,
    present: attendanceRecords.filter((r) => r.hrStatus === 'PRESENT').length,
    late: attendanceRecords.filter((r) => r.hrStatus === 'LATE').length,
    absent: attendanceRecords.filter((r) => r.hrStatus === 'ABSENT').length,
    leave: attendanceRecords.filter((r) => r.hrStatus === 'LEAVE').length,
    unmarked: result.length - attendanceRecords.length,
  }

  return successResponse({ teachers: result, date, shift, summary })
}

// ── POST /api/teachers/attendance ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'attendance', 'create')) {
    return errors.forbidden()
  }
  // Explicit double-gate: teachers cannot mark teacher HR attendance
  if (session.user.role === 'TEACHER') {
    return errors.forbidden('Teacher HR attendance is managed by campus administration')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errors.badRequest('Invalid JSON body')
  }

  const parsed = bulkMarkSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { records } = parsed.data

  // ── Campus-scope enforcement ─────────────────────────────────────────────
  // For ADMIN: all teacherIds in the payload must belong to their campus.
  // Validate in one query before any writes occur.
  if (session.user.role === 'ADMIN') {
    const campusId = session.user.campusId
    if (!campusId) return errors.forbidden('Admin has no assigned campus')

    const teacherIds = [...new Set(records.map((r) => r.teacherId))]
    const teachersInCampus = await prisma.teacher.findMany({
      where: { id: { in: teacherIds }, campusId },
      select: { id: true },
    })
    const inCampusSet = new Set(teachersInCampus.map((t) => t.id))
    const outsiders = teacherIds.filter((id) => !inCampusSet.has(id))
    if (outsiders.length > 0) {
      return errors.forbidden(
        `${outsiders.length} teacher(s) do not belong to your campus and cannot be marked`
      )
    }
  }

  // ── Resolve all teacher profiles needed for penalty calculation ──────────
  const uniqueTeacherIds = [...new Set(records.map((r) => r.teacherId))]
  const teacherProfiles = await prisma.teacher.findMany({
    where: { id: { in: uniqueTeacherIds } },
    select: { id: true, campusId: true, monthlySalary: true, isActive: true, userId: true, firstName: true, lastName: true },
  })
  const teacherMap = new Map(teacherProfiles.map((t) => [t.id, t]))

  const results: Array<{ teacherId: string; status: 'marked' | 'skipped'; reason?: string }> = []

  for (const record of records) {
    const teacher = teacherMap.get(record.teacherId)

    if (!teacher) {
      results.push({ teacherId: record.teacherId, status: 'skipped', reason: 'Teacher not found' })
      continue
    }
    if (!teacher.isActive) {
      results.push({ teacherId: record.teacherId, status: 'skipped', reason: 'Teacher is inactive' })
      continue
    }

    const attendanceDate = new Date(`${record.date}T00:00:00.000Z`)

    try {
      const resolved = await resolveAttendanceMark({
        teacher,
        date: attendanceDate,
        shift: record.shift as SessionShift,
        status: record.status as AttendanceStatus,
        checkInTime: record.checkInTime,
        penaltyAmount: record.penaltyAmount,
        isPenaltyApplied: record.isPenaltyApplied,
      })

      await prisma.$transaction(async (tx) => {
        const upserted = await tx.teacherAttendance.upsert({
          where: {
            teacherId_date_shift: {
              teacherId: record.teacherId,
              date: attendanceDate,
              shift: record.shift,
            },
          },
          create: {
            teacherId: record.teacherId,
            date: attendanceDate,
            shift: record.shift,
            status: resolved.status,
            hrStatus: resolved.hrStatus,
            checkInTime: resolved.checkInTime,
            lateMinutes: resolved.lateMinutes,
            penaltyAmount: resolved.penaltyAmount,
            isPenaltyApplied: resolved.isPenaltyApplied,
            remarks: record.remarks ?? null,
          },
          update: {
            status: resolved.status,
            hrStatus: resolved.hrStatus,
            checkInTime: resolved.checkInTime,
            lateMinutes: resolved.lateMinutes,
            penaltyAmount: resolved.penaltyAmount,
            isPenaltyApplied: resolved.isPenaltyApplied,
            remarks: record.remarks ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            entityType: 'TeacherAttendance',
            entityId: upserted.id,
            changes: {
              teacherId: record.teacherId,
              date: record.date,
              shift: record.shift,
              requestedStatus: record.status,
              resolvedStatus: resolved.status,
              hrStatus: resolved.hrStatus,
              lateMinutes: resolved.lateMinutes,
              penaltyAmount: resolved.penaltyAmount,
              isPenaltyApplied: resolved.isPenaltyApplied,
            },
          },
        })

        // Notify the teacher of their attendance record
        if (teacher.userId) {
          await tx.notification.create({
            data: {
              userId: teacher.userId,
              title: 'Attendance recorded',
              message: `${record.date} ${SESSION_SHIFT_LABELS[record.shift as SessionShift]} — ${resolved.hrStatus}${
                resolved.lateMinutes > 0 ? ` (${resolved.lateMinutes} min late)` : ''
              }${resolved.penaltyAmount > 0 ? ` · Penalty: Rs ${resolved.penaltyAmount.toFixed(0)}` : ''}.`,
              type: 'ATTENDANCE_ALERT',
            },
          })
        }
      })

      results.push({ teacherId: record.teacherId, status: 'marked' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      results.push({ teacherId: record.teacherId, status: 'skipped', reason: msg })
    }
  }

  const markedCount = results.filter((r) => r.status === 'marked').length
  const skippedCount = results.filter((r) => r.status === 'skipped').length

  return createdResponse(
    { results, marked: markedCount, skipped: skippedCount },
    `${markedCount} attendance record(s) saved${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`
  )
}
