import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession } from '@/lib/academic/api-helpers'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { verifyToken } from '@/lib/jwt-utils'
import type { EnrollmentAttendanceRecord } from '@prisma/client'

/**
 * Mark attendance by scanning QR code
 * QR code contains JWT token with classSectionId and metadata
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  try {
    const body = await request.json()
    const { qrToken, studentEnrollmentId, manualStatus } = body

    // If using manual entry, just mark directly
    if (manualStatus && studentEnrollmentId) {
      const activeYear = await getActiveAcademicYear()
      if (!activeYear) return errors.notFound('No active academic year')

      const enrollment = await prisma.studentEnrollment.findUnique({
        where: { id: studentEnrollmentId },
        include: { classSection: true },
      })

      if (!enrollment) return errors.notFound('Enrollment not found')

      // Mark attendance
      const record = await prisma.enrollmentAttendanceRecord.create({
        data: {
          studentEnrollmentId,
          attendanceDate: new Date(),
          status: manualStatus,
          markedByTeacherId: session.user.id,
          markedAt: new Date(),
        },
      })

      return successResponse({
        success: true,
        attendanceId: record.id,
        status: record.status,
        message: `Attendance marked: ${manualStatus}`,
      })
    }

    // QR code scanning path
    if (!qrToken) {
      return errors.validation({
        errors: [{ path: ['qrToken'], message: 'qrToken or manual marking required' }],
      } as never)
    }

    // Verify JWT token
    let decodedToken: any
    try {
      decodedToken = verifyToken(qrToken)
      if (!decodedToken) throw new Error('Invalid token')
    } catch (err) {
      return errors.validation({
        errors: [{ path: ['qrToken'], message: 'Invalid or expired QR code' }],
      } as never)
    }

    const { classSectionId, academicYearId } = decodedToken

    const activeYear = await getActiveAcademicYear()
    if (!activeYear || activeYear.id !== academicYearId) {
      return errors.validation({
        errors: [{ path: ['qrToken'], message: 'QR code is for a different academic year' }],
      } as never)
    }

    if (!studentEnrollmentId) {
      return errors.validation({
        errors: [{ path: ['studentEnrollmentId'], message: 'studentEnrollmentId is required' }],
      } as never)
    }

    // Verify enrollment belongs to this class section
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { id: studentEnrollmentId },
    })

    if (!enrollment || enrollment.classSectionId !== classSectionId) {
      return errors.validation({
        errors: [{ path: ['studentEnrollmentId'], message: 'Enrollment not in this class section' }],
      } as never)
    }

    // Check if already marked today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const existing = await prisma.enrollmentAttendanceRecord.findFirst({
      where: {
        studentEnrollmentId,
        attendanceDate: {
          gte: today,
          lt: tomorrow,
        },
      },
    })

    if (existing) {
      return successResponse({
        success: false,
        message: 'Already marked as present for today',
        existingStatus: existing.status,
      })
    }

    // Mark as PRESENT via QR scan
    const record = await prisma.enrollmentAttendanceRecord.create({
      data: {
        studentEnrollmentId,
        attendanceDate: today,
        status: 'PRESENT',
        markedByTeacherId: session.user.id,
        markedAt: new Date(),
      },
    })

    return successResponse({
      success: true,
      attendanceId: record.id,
      status: record.status,
      message: 'Attendance marked as PRESENT',
    })
  } catch (err) {
    console.error('Attendance scan error:', err)
    return errors.internal('Failed to process attendance')
  }
}
