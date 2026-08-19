/**
 * POST /api/teacher-portal/attendance/import/student
 *
 * Teacher-scoped biometric Excel ingestion for student attendance.
 *
 * WHY this route exists:
 *   The admin import endpoint (/api/admin/attendance/import/student) explicitly
 *   blocks the TEACHER role. Teachers need their own import endpoint that:
 *     1. Allows TEACHER, ADMIN, and SUPER_ADMIN roles.
 *     2. Enforces class-section ownership for TEACHER role — teachers can only
 *        import attendance for sections they are assigned to teach.
 *     3. Resolves markedByTeacherId via the shared resolveMarkedByTeacherId()
 *        helper, consistent with manual attendance marking.
 *
 * Security:
 *   - TEACHER: each classSectionId in the Excel is validated against
 *     teacherCanAccessClassSection() before any row is accepted.
 *   - ADMIN / SUPER_ADMIN: no section restriction applied.
 *   - Fail-fast: any validation error aborts the entire import (no partial writes).
 *   - All attempts logged to AttendanceImportLog.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { resolveMarkedByTeacherId } from '@/lib/academic/attendance'
import {
  getTeacherByUserId,
  teacherCanAccessClassSection,
} from '@/lib/academic/teacher-scope'
import type { Role, AttendanceStatus } from '@prisma/client'
import * as XLSX from 'xlsx'
import { createStudentAbsenceAssessment } from '@/lib/penalties/assessments'

// ── Date helper ────────────────────────────────────────────────────────────────

function parseExcelDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    return new Date(Math.round((val - 25569) * 86400 * 1000))
  }
  const d = new Date(String(val).trim())
  return isNaN(d.getTime()) ? null : d
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    const role = session.user.role as Role

    const allowedRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER']
    if (!allowedRoles.includes(role)) {
      return errors.forbidden('Only Teachers, Admins, and Super Admins can import student attendance')
    }

    // For TEACHER role: resolve their Teacher record for scope checks
    let teacherRecord: Awaited<ReturnType<typeof getTeacherByUserId>> = null
    if (role === 'TEACHER') {
      teacherRecord = await getTeacherByUserId(session.user.id)
      if (!teacherRecord) {
        return errors.forbidden('Teacher profile not found. Contact an administrator.')
      }
    }

    // ── Parse multipart form ─────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return errors.badRequest('No file uploaded')

    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })

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
      'student id',
      'class section id',
      'date (yyyy-mm-dd)',
      'status (present/absent/late/excused)',
    ]
    const missing = requiredHeaders.filter((h) => !headersRow.includes(h))
    if (missing.length > 0) {
      return errors.badRequest(
        `Invalid schema. Missing required columns: ${missing.join(', ')}. ` +
          `Download the template to see the correct format.`
      )
    }

    const col = {
      studentId:      headersRow.indexOf('student id'),
      classSectionId: headersRow.indexOf('class section id'),
      date:           headersRow.indexOf('date (yyyy-mm-dd)'),
      status:         headersRow.indexOf('status (present/absent/late/excused)'),
      remarks:        headersRow.indexOf('remarks'),
    }

    // ── Active academic year required ────────────────────────────────────
    const activeYear = await getActiveAcademicYear()
    if (!activeYear) {
      return errors.badRequest('No active academic year is currently configured. Contact an administrator.')
    }

    // ── Pre-load all enrollments for the active year ─────────────────────
    // Build a lookup: (studentId | classSectionId) → enrollmentId
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { academicYearId: activeYear.id, status: 'ACTIVE' },
      include: {
        student: {
          select: { id: true, rollNumber: true, registrationNumber: true },
        },
      },
    })

    const enrollmentMap = new Map<string, string>()
    for (const enr of enrollments) {
      const secId = enr.classSectionId.toLowerCase()
      if (enr.student.rollNumber) {
        enrollmentMap.set(`${enr.student.rollNumber.toUpperCase()}|${secId}`, enr.id)
      }
      if (enr.student.registrationNumber) {
        enrollmentMap.set(`${enr.student.registrationNumber.toUpperCase()}|${secId}`, enr.id)
      }
      if (enr.rollNumber) {
        enrollmentMap.set(`${enr.rollNumber.toUpperCase()}|${secId}`, enr.id)
      }
    }

    // ── Resolve who will be recorded as the attendance marker ────────────
    const markedBy = await resolveMarkedByTeacherId(session.user.id)

    // ── Section-access cache (teacher role only) ─────────────────────────
    // Cache per-section auth checks to avoid N DB calls for repeated sections
    const sectionAccessCache = new Map<string, boolean>()

    async function canAccessSection(sectionId: string): Promise<boolean> {
      if (role !== 'TEACHER') return true // Admins have no section restriction
      if (sectionAccessCache.has(sectionId)) return sectionAccessCache.get(sectionId)!
      const allowed = await teacherCanAccessClassSection(
        teacherRecord!.id,
        sectionId,
        activeYear.id
      )
      sectionAccessCache.set(sectionId, allowed)
      return allowed
    }

    // ── Row-level validation ─────────────────────────────────────────────
    const rows = jsonData.slice(1) as unknown[][]
    const rowErrors: { row: number; errors: string[] }[] = []

    type ParsedRecord = {
      studentEnrollmentId: string
      attendanceDate: Date
      status: AttendanceStatus
      remarks: string | null
    }
    const parsedRecords: ParsedRecord[] = []

    const validStatuses = new Set<string>(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      if (
        !row ||
        row.length === 0 ||
        row.every((c) => c === null || c === undefined || c === '')
      ) {
        continue
      }

      const rowIndex  = i + 2
      const errorList: string[] = []

      const rawStudentId  = row[col.studentId]
      const rawSecId      = row[col.classSectionId]
      const rawDate       = row[col.date]
      const rawStatus     = row[col.status]
      const rawRemarks    = col.remarks >= 0 ? row[col.remarks] : null

      if (!rawStudentId) errorList.push('Student ID is required')
      if (!rawSecId)     errorList.push('Class Section ID is required')
      if (!rawDate)      errorList.push('Date is required')
      if (!rawStatus)    errorList.push('Status is required')

      const parsedDate = parseExcelDate(rawDate)
      if (rawDate && !parsedDate) {
        errorList.push(
          `Invalid Date format: "${rawDate}". Expected YYYY-MM-DD (e.g. 2026-07-13).`
        )
      }

      const normalizedStatus = String(rawStatus ?? '').toUpperCase().trim()
      if (rawStatus && !validStatuses.has(normalizedStatus)) {
        errorList.push(
          `Invalid Status: "${rawStatus}". Must be PRESENT, ABSENT, LATE, or EXCUSED.`
        )
      }

      const studentKey = String(rawStudentId ?? '').toUpperCase().trim()
      const sectionKey = String(rawSecId ?? '').toLowerCase().trim()
      const enrollmentId = enrollmentMap.get(`${studentKey}|${sectionKey}`)

      if (rawStudentId && rawSecId && !enrollmentId) {
        errorList.push(
          `Student "${rawStudentId}" is not actively enrolled in section "${rawSecId}" for the current academic year.`
        )
      }

      // Section ownership check for TEACHER role
      if (role === 'TEACHER' && rawSecId && errorList.length === 0) {
        const allowed = await canAccessSection(sectionKey)
        if (!allowed) {
          errorList.push(
            `You are not assigned to teach section "${rawSecId}". ` +
              `You can only import attendance for your own class sections.`
          )
        }
      }

      if (errorList.length > 0) {
        rowErrors.push({ row: rowIndex, errors: errorList })
        continue
      }

      parsedRecords.push({
        studentEnrollmentId: enrollmentId!,
        attendanceDate:      parsedDate!,
        status:              normalizedStatus as AttendanceStatus,
        remarks:             rawRemarks ? String(rawRemarks).trim() : null,
      })
    }

    // ── Abort on validation failure ───────────────────────────────────────
    if (rowErrors.length > 0) {
      await prisma.attendanceImportLog.create({
        data: {
          fileName:     file.name,
          importType:   'STUDENT',
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

    // ── ACID transaction ─────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      for (const rec of parsedRecords) {
        const attendanceRecord = await tx.enrollmentAttendanceRecord.upsert({
          where: {
            studentEnrollmentId_attendanceDate: {
              studentEnrollmentId: rec.studentEnrollmentId,
              attendanceDate:      rec.attendanceDate,
            },
          },
          create: {
            studentEnrollmentId: rec.studentEnrollmentId,
            attendanceDate:      rec.attendanceDate,
            status:              rec.status,
            remarks:             rec.remarks,
            markedByTeacherId:   markedBy,
          },
          update: {
            status:            rec.status,
            remarks:           rec.remarks,
            markedByTeacherId: markedBy,
          },
        })
        await createStudentAbsenceAssessment(tx, {
          attendanceRecordId: attendanceRecord.id,
          attendanceDate: rec.attendanceDate,
          markedByUserId: session.user.id,
        })
      }

      await tx.attendanceImportLog.create({
        data: {
          fileName:     file.name,
          importType:   'STUDENT',
          totalRows:    rows.length,
          successRows:  parsedRecords.length,
          failedRows:   0,
          importedById: session.user.id,
        },
      })
    })

    return successResponse(
      { count: parsedRecords.length },
      `Student attendance successfully imported: ${parsedRecords.length} record(s) upserted.`
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[TEACHER_STUDENT_ATTENDANCE_IMPORT]', err)
    return errors.internal(msg)
  }
}
