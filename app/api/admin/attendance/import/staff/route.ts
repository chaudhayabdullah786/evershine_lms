/**
 * POST /api/admin/attendance/import/staff
 *
 * Biometric Excel ingestion for staff/teacher HR attendance.
 *
 * WHY this route exists: The biometric device exports an Excel report that
 * must be mapped to TeacherAttendance records. This endpoint validates the
 * Excel schema, calls the shared `resolveAttendanceMark()` engine so that
 * penalty policy, hrStatus, lateMinutes, and gracePass logic are consistent
 * with the manual bulk-mark endpoint (/api/teachers/attendance), then upserts
 * all records in a single ACID transaction.
 *
 * RBAC: SUPER_ADMIN and ADMIN only.
 *
 * Security:
 *   - File validated before any DB write (fail-fast, no partial imports)
 *   - ADMIN: cross-campus employee IDs are rejected during teacher resolution
 *   - All imports logged to AttendanceImportLog for audit trail
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { resolveAttendanceMark } from '@/lib/teacher-attendance'
import type { Role, AttendanceStatus } from '@prisma/client'
import type { SessionShift } from '@/lib/validation/shift'
import * as XLSX from 'xlsx'

// ── Date helpers ───────────────────────────────────────────────────────────────

/** Converts an Excel serial number or date string to a JS Date. */
function parseExcelDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    // Excel epoch: 1899-12-30 (day 0 = Dec 30, 1899)
    return new Date(Math.round((val - 25569) * 86400 * 1000))
  }
  const dateStr = String(val).trim()
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parses an HH:MM:SS time string and merges it with a date string
 * into a full ISO datetime for check-in/out storage.
 */
function buildCheckInISO(dateStr: string, timeStr: string | null | undefined): string | null {
  if (!timeStr) return null
  const cleanTime = String(timeStr).trim()
  const match = cleanTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return null

  const hours   = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const seconds = match[3] ? parseInt(match[3], 10) : 0

  const d = new Date(dateStr)
  d.setHours(hours, minutes, seconds, 0)
  return d.toISOString()
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    const role = session.user.role as Role
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return errors.forbidden('Only Admins and Super Admins can import staff attendance')
    }

    // ── Parse multipart form ─────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return errors.badRequest('No file uploaded')

    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })

    // Prefer a sheet named "template" (case-insensitive), fall back to first sheet
    const sheetName =
      workbook.SheetNames.find((n) => n.toLowerCase() === 'template') ||
      workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 })

    if (jsonData.length === 0) {
      return errors.badRequest('The uploaded Excel file is empty')
    }

    // ── Header validation ────────────────────────────────────────────────
    const headersRow = (jsonData[0] as unknown[]).map((h) =>
      String(h).trim().toLowerCase()
    )

    const requiredHeaders = [
      'employee id',
      'date (yyyy-mm-dd)',
      'shift (morning/evening)',
      'check-in time (hh:mm:ss)',
    ]
    const missing = requiredHeaders.filter((h) => !headersRow.includes(h))
    if (missing.length > 0) {
      return errors.badRequest(
        `Invalid schema. Missing required columns: ${missing.join(', ')}. ` +
          `Download the template to see the correct format.`
      )
    }

    const col = {
      employeeId:  headersRow.indexOf('employee id'),
      date:        headersRow.indexOf('date (yyyy-mm-dd)'),
      shift:       headersRow.indexOf('shift (morning/evening)'),
      checkIn:     headersRow.indexOf('check-in time (hh:mm:ss)'),
      checkOut:    headersRow.indexOf('check-out time (hh:mm:ss)'),
      remarks:     headersRow.indexOf('remarks'),
    }

    // ── Pre-load DB references for O(1) row lookups ──────────────────────
    // Build a campus scope for ADMIN: only allow teachers from their campus
    const adminCampusId =
      role === 'ADMIN' ? (session.user.campusId ?? null) : null

    const dbTeachers = await prisma.teacher.findMany({
      where: {
        isActive: true,
        ...(adminCampusId ? { campusId: adminCampusId } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        campusId: true,
        monthlySalary: true,
        isActive: true,
        userId: true,
        firstName: true,
        lastName: true,
      },
    })

    // Index by employeeId (upper-cased) for O(1) lookup
    const teacherMap = new Map(
      dbTeachers.map((t) => [t.employeeId.toUpperCase(), t])
    )

    // ── Row-level validation ─────────────────────────────────────────────
    const rows = jsonData.slice(1) as unknown[][]
    const rowErrors: { row: number; errors: string[] }[] = []

    type ParsedRecord = {
      teacher: (typeof dbTeachers)[0]
      date: Date
      dateStr: string
      shift: SessionShift
      status: AttendanceStatus
      checkInISO: string | null
      checkOutISO: string | null
      remarks: string | null
    }
    const parsedRecords: ParsedRecord[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      // Skip completely blank rows
      if (
        !row ||
        row.length === 0 ||
        row.every((c) => c === null || c === undefined || c === '')
      ) {
        continue
      }

      const rowIndex  = i + 2 // 1-indexed, header is row 1
      const errorList: string[] = []

      const rawEmployeeId = row[col.employeeId]
      const rawDate       = row[col.date]
      const rawShift      = row[col.shift]
      const rawCheckIn    = col.checkIn  >= 0 ? row[col.checkIn]  : null
      const rawCheckOut   = col.checkOut >= 0 ? row[col.checkOut] : null
      const rawRemarks    = col.remarks  >= 0 ? row[col.remarks]  : null

      // Required field checks
      if (!rawEmployeeId) errorList.push('Employee ID is required')
      if (!rawDate)       errorList.push('Date is required')
      if (!rawShift)      errorList.push('Shift is required')

      // Date parsing
      const parsedDate = parseExcelDate(rawDate)
      if (rawDate && !parsedDate) {
        errorList.push(
          `Invalid Date format: "${rawDate}". Expected YYYY-MM-DD (e.g. 2026-07-13).`
        )
      }

      // Shift validation
      const normalizedShift = String(rawShift ?? '')
        .toUpperCase()
        .trim() as SessionShift
      if (rawShift && normalizedShift !== 'MORNING' && normalizedShift !== 'EVENING') {
        errorList.push(
          `Invalid Shift: "${rawShift}". Must be exactly MORNING or EVENING.`
        )
      }

      // Employee ID resolution
      const employeeIdKey = String(rawEmployeeId ?? '').toUpperCase().trim()
      const teacher = teacherMap.get(employeeIdKey) ?? null
      if (rawEmployeeId && !teacher) {
        errorList.push(
          `Employee ID "${rawEmployeeId}" not found${
            adminCampusId ? ' in your campus' : ''
          }. Check the Teacher Code in Staff Directory.`
        )
      }

      // Time parsing (only validate format; status auto-derived by resolveAttendanceMark)
      const dateStr = parsedDate
        ? parsedDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      const checkInISO  = rawCheckIn  ? buildCheckInISO(dateStr, String(rawCheckIn))  : null
      const checkOutISO = rawCheckOut ? buildCheckInISO(dateStr, String(rawCheckOut)) : null

      if (rawCheckIn && !checkInISO) {
        errorList.push(
          `Invalid Check-In Time format: "${rawCheckIn}". Expected HH:MM:SS (e.g. 08:30:00).`
        )
      }
      if (rawCheckOut && !checkOutISO) {
        errorList.push(
          `Invalid Check-Out Time format: "${rawCheckOut}". Expected HH:MM:SS (e.g. 16:00:00).`
        )
      }

      if (errorList.length > 0) {
        rowErrors.push({ row: rowIndex, errors: errorList })
        continue
      }

      // Determine raw status hint:
      //   - No check-in time in the row → treat as ABSENT for resolveAttendanceMark
      //   - Check-in present → treat as PRESENT; resolveAttendanceMark will
      //     upgrade to LATE if check-in exceeds shift grace window
      const rawStatusHint: AttendanceStatus = rawCheckIn ? 'PRESENT' : 'ABSENT'

      parsedRecords.push({
        teacher: teacher!,
        date: parsedDate!,
        dateStr,
        shift: normalizedShift,
        status: rawStatusHint,
        checkInISO,
        checkOutISO,
        remarks: rawRemarks ? String(rawRemarks).trim() : null,
      })
    }

    // ── Abort on any validation failure (no partial imports) ─────────────
    if (rowErrors.length > 0) {
      // Log the failed attempt for audit purposes
      await prisma.attendanceImportLog.create({
        data: {
          fileName:     file.name,
          importType:   'STAFF',
          totalRows:    rows.length,
          successRows:  0,
          failedRows:   rowErrors.length,
          errorLog:     rowErrors as unknown as object,
          importedById: session.user.id,
        },
      })

      return errors.badRequest({
        message: `Validation failed for ${rowErrors.length} row(s). No records were imported.`,
        rowErrors,
      } as never)
    }

    // ── Resolve penalty + hrStatus via shared domain engine ──────────────
    // WHY: resolveAttendanceMark() reads TeacherPenaltyPolicy, counts prior
    // late-marks this month, and applies grace-pass + repeat-multiplier logic.
    // Calling it here makes the biometric import path identical to the
    // manual bulk-mark path (/api/teachers/attendance POST).
    type ResolvedRecord = ParsedRecord & {
      hrStatus: string
      lateMinutes: number
      penaltyAmount: number
      isPenaltyApplied: boolean
    }

    const resolvedRecords: ResolvedRecord[] = []

    for (const rec of parsedRecords) {
      const resolved = await resolveAttendanceMark({
        teacher:    rec.teacher,
        date:       rec.date,
        shift:      rec.shift,
        status:     rec.status,
        checkInTime: rec.checkInISO ?? undefined,
        // isPenaltyApplied intentionally left undefined (HR reviews before applying)
      })

      resolvedRecords.push({
        ...rec,
        hrStatus:         resolved.hrStatus,
        lateMinutes:      resolved.lateMinutes,
        penaltyAmount:    resolved.penaltyAmount,
        isPenaltyApplied: false, // HR must review and explicitly apply penalties
      })
    }

    // ── ACID transaction: upsert all records or roll back ─────────────────
    await prisma.$transaction(async (tx) => {
      for (const rec of resolvedRecords) {
        await tx.teacherAttendance.upsert({
          where: {
            teacherId_date_shift: {
              teacherId: rec.teacher.id,
              date:      rec.date,
              shift:     rec.shift,
            },
          },
          create: {
            teacherId:        rec.teacher.id,
            date:             rec.date,
            shift:            rec.shift,
            status:           rec.status,
            hrStatus:         rec.hrStatus as never,
            checkInTime:      rec.checkInISO  ? new Date(rec.checkInISO)  : null,
            checkOutTime:     rec.checkOutISO ? new Date(rec.checkOutISO) : null,
            lateMinutes:      rec.lateMinutes,
            penaltyAmount:    rec.penaltyAmount,
            isPenaltyApplied: rec.isPenaltyApplied,
            remarks:          rec.remarks,
          },
          update: {
            status:           rec.status,
            hrStatus:         rec.hrStatus as never,
            checkInTime:      rec.checkInISO  ? new Date(rec.checkInISO)  : null,
            checkOutTime:     rec.checkOutISO ? new Date(rec.checkOutISO) : null,
            lateMinutes:      rec.lateMinutes,
            penaltyAmount:    rec.penaltyAmount,
            // Only reset penalty flag if the record is being revised
            isPenaltyApplied: rec.isPenaltyApplied,
            remarks:          rec.remarks,
          },
        })

        // Notify the teacher of their imported attendance record
        if (rec.teacher.userId) {
          await tx.notification.create({
            data: {
              userId: rec.teacher.userId,
              title:  'Attendance Imported',
              message: `Your attendance for ${rec.dateStr} (${rec.shift}) has been recorded: ` +
                `${rec.hrStatus}${rec.lateMinutes > 0 ? ` — ${rec.lateMinutes} min late` : ''}` +
                `${rec.penaltyAmount > 0 ? `. Penalty of Rs ${rec.penaltyAmount.toFixed(0)} pending HR review.` : '.'}`,
              type: 'ATTENDANCE_ALERT',
            },
          })
        }
      }

      // Write audit import log
      await tx.attendanceImportLog.create({
        data: {
          fileName:     file.name,
          importType:   'STAFF',
          totalRows:    rows.length,
          successRows:  resolvedRecords.length,
          failedRows:   0,
          importedById: session.user.id,
        },
      })
    })

    return successResponse(
      { count: resolvedRecords.length },
      `Staff attendance successfully imported: ${resolvedRecords.length} record(s) upserted.`
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[STAFF_ATTENDANCE_IMPORT]', err)
    return errors.internal(msg)
  }
}
