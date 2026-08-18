import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requirePermission, requireSession } from '@/lib/academic/api-helpers'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { resolveMarkedByTeacherId } from '@/lib/academic/attendance'
import { getTeacherByUserId, teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import type { Role } from '@prisma/client'

function parseAttendanceDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * POST /api/enrollment-attendance/student-card-scan
 *
 * Marks one enrolled student present from their student-card attendance
 * credential. The credential is resolved inside the selected class section
 * and the caller's teacher assignment is checked server-side before writing.
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  const denied = requirePermission(session.user.role as Role, 'attendance', 'create')
  if (denied) return denied

  try {
    const body = await request.json()
    const classSectionId = typeof body.classSectionId === 'string' ? body.classSectionId.trim() : ''
    const studentQrCode = typeof body.studentQrCode === 'string' ? body.studentQrCode.trim() : ''
    const attendanceDate = parseAttendanceDate(body.attendanceDate)

    if (!classSectionId || !studentQrCode || !attendanceDate) {
      return errors.validation({
        errors: [{ path: ['classSectionId', 'studentQrCode', 'attendanceDate'], message: 'A class section, student card QR, and valid date are required' }],
      } as never)
    }

    // Student cards use an attendance-only credential. Keep legacy ESA-QR
    // cards working while preventing arbitrary registration values from being
    // submitted to this endpoint.
    if (!/^esa-qr-/i.test(studentQrCode)) {
      return errors.validation({
        errors: [{ path: ['studentQrCode'], message: 'This QR code is not a student attendance credential' }],
      } as never)
    }

    const activeYear = await getActiveAcademicYear()
    if (!activeYear) return errors.notFound('No active academic year')
    if (activeYear.isLocked) return errors.forbidden('Academic year is locked')

    if (session.user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(session.user.id)
      if (!teacher || !(await teacherCanAccessClassSection(teacher.id, classSectionId, activeYear.id))) {
        return errors.forbidden('Not assigned to this class section')
      }
    }

    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        classSectionId,
        academicYearId: activeYear.id,
        status: 'ACTIVE',
        student: { isActive: true, idCardQRCode: studentQrCode },
      },
      select: {
        id: true,
        rollNumber: true,
        student: { select: { firstName: true, lastName: true, registrationNumber: true } },
      },
    })

    if (!enrollment) {
      return errors.notFound('Student card is not active in this class section')
    }

    const markedByTeacherId = await resolveMarkedByTeacherId(session.user.id)

    const existing = await prisma.enrollmentAttendanceRecord.findUnique({
      where: {
        studentEnrollmentId_attendanceDate: {
          studentEnrollmentId: enrollment.id,
          attendanceDate,
        },
      },
      select: { id: true, status: true },
    })

    if (existing) {
      return successResponse({
        success: true,
        alreadyMarked: true,
        attendanceId: existing.id,
        status: existing.status,
        studentEnrollmentId: enrollment.id,
        student: enrollment.student,
      })
    }

    const record = await prisma.enrollmentAttendanceRecord.create({
      data: {
        studentEnrollmentId: enrollment.id,
        attendanceDate,
        status: 'PRESENT',
        markedByTeacherId,
      },
      select: { id: true, status: true },
    })

    return successResponse({
      success: true,
      alreadyMarked: false,
      attendanceId: record.id,
      status: record.status,
      studentEnrollmentId: enrollment.id,
      student: enrollment.student,
      rollNumber: enrollment.rollNumber,
    })
  } catch (err) {
    console.error('Student card attendance scan error:', err)
    return errors.internal()
  }
}
