/**
 * GET /api/teacher-portal/sections/[classSectionId]/students
 *
 * Returns student list for a class section.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classSectionId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const { classSectionId } = await params

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fatherName: true,
          },
        },
      },
    })

    const studentsList = enrollments.map((e) => ({
      id: e.student.id,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      rollNumber: e.rollNumber,
      fatherName: e.student.fatherName ?? '',
    }))

    return successResponse(studentsList)
  } catch (err) {
    console.error('[TEACHER_SECTION_STUDENTS_GET]', err)
    return errors.internal()
  }
}
