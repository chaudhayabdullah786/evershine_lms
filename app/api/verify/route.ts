/**
 * GET /api/verify?id=ESA-QR-ESA-2024-0001
 *
 * Public endpoint — no authentication required.
 * Used by QR code scanning on student ID cards to verify authenticity.
 *
 * WHY public: Parents, teachers, and visitors scan the QR at the gate.
 * Requiring a login would make verification impractical.
 *
 * WHY minimal data returned: Only public-safe fields are exposed.
 * No contact numbers, addresses, or financial data.
 *
 * SECURITY: This endpoint is rate-limited by IP at the middleware level
 * to prevent bulk scraping of student data via sequential QR IDs.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { successResponse, errors } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const qrId = searchParams.get('id')?.trim()

  if (!qrId || qrId.length < 3) {
    return errors.validation({ errors: [{ path: ['id'], message: 'QR ID is required' }] } as never)
  }

  const student = await prisma.student.findFirst({
    where: {
      OR: [
        { idCardQRCode: qrId },
        { registrationNumber: qrId },
      ],
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fatherName: true,
      registrationNumber: true,
      gender: true,
      profilePicture: true,
      idCardIssueDate: true,
      idCardExpiryDate: true,
      enrollmentStatus: true,
      academicYear: true,
      campus: { select: { name: true } },
      batch: { select: { name: true } },
      class: { select: { name: true, grade: true } },
      house: { select: { name: true, color: true } },
    },
  })

  if (!student) {
    return errors.notFound('Student — this QR code is not registered or is invalid')
  }

  // Determine card validity
  const isValid =
    student.enrollmentStatus === 'ACTIVE' &&
    (!student.idCardExpiryDate || student.idCardExpiryDate > new Date())

  return successResponse({
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      fatherName: student.fatherName,
      registrationNumber: student.registrationNumber,
      gender: student.gender,
      profilePicture: student.profilePicture,
      academicYear: student.academicYear,
      campus: student.campus.name,
      batch: student.batch.name,
      class: student.class?.name ?? 'N/A',
      house: student.house?.name ?? 'N/A',
      enrollmentStatus: student.enrollmentStatus,
      idCardIssueDate: student.idCardIssueDate,
      idCardExpiryDate: student.idCardExpiryDate,
    },
    verification: {
      isValid,
      verifiedAt: new Date().toISOString(),
      status: isValid ? 'VERIFIED' : 'INVALID',
    },
  })
}
