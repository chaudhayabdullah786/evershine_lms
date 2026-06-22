import { NextRequest } from 'next/server'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherByUserId, teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import { createToken } from '@/lib/jwt-utils'
import type { Role } from '@prisma/client'
import QRCode from 'qrcode'

/**
 * Generate QR code for attendance scanning
 * QR contains JWT token with classSectionId, timestamp, and teacher info
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'attendance', 'create')
  if (denied) return denied

  try {
    const body = await request.json()
    const { classSectionId } = body

    if (!classSectionId) {
      return errors.validation({
        errors: [{ path: ['classSectionId'], message: 'classSectionId is required' }],
      } as never)
    }

    const activeYear = await getActiveAcademicYear()
    if (!activeYear) return errors.notFound('No active academic year')

    if (session.user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(session.user.id)
      if (!teacher) return errors.forbidden()

      const allowed = await teacherCanAccessClassSection(teacher.id, classSectionId, activeYear?.id)
      if (!allowed) {
        return errors.forbidden('Not assigned to this class section')
      }
    }

    // Create JWT token for QR code (expires in 30 minutes)
    const teacherId = session.user.role === 'TEACHER'
      ? (await getTeacherByUserId(session.user.id))?.id ?? session.user.id
      : session.user.id

    const tokenPayload = {
      classSectionId,
      teacherId,
      timestamp: new Date().toISOString(),
      academicYearId: activeYear.id,
    }

    const token = createToken(tokenPayload, 30 * 60) // 30 minutes in seconds

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(token, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })

    return successResponse({
      qrCode: qrCodeDataUrl,
      token,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      classSectionId,
    })
  } catch (err) {
    console.error('QR code generation error:', err)
    return errors.internal('Failed to generate QR code')
  }
}
