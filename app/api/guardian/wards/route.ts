/**
 * GET /api/guardian/wards
 * Lists all students (wards) linked to the authenticated guardian session.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden('Only guardians can access this endpoint')

  // Find the guardian profile for this user
  const guardian = await prisma.guardian.findUnique({
    where: { userId: session.user.id },
    select: {
      students: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          registrationNumber: true,
          profilePicture: true,
          gender: true,
          dateOfBirth: true,
          batch: { select: { name: true } },
          class: { select: { grade: true, name: true } },
          section: true,
          enrollmentStatus: true,
        },
      },
    },
  })

  if (!guardian) {
    return errors.forbidden('Guardian profile not found for this account')
  }

  return successResponse(guardian.students)
}
