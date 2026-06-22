/**
 * GET /api/guardian/wards/[studentId]/academics
 * Returns academic summary for a specific ward (enrollments, class, general metrics).
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { assertGuardianOwnsStudent } from '@/lib/guardian/assert-ownership'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden()

  const { studentId } = await params
  
  try {
    await assertGuardianOwnsStudent(session.user.id, studentId)
  } catch (error: any) {
    return errors.forbidden(error.message)
  }

  // Fetch student's academic snapshot (active enrollment, etc.)
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      enrollments: {
        where: { status: 'ACTIVE' },
        include: {
          academicYear: { select: { name: true } },
          classSection: {
            include: {
              class: { select: { name: true, grade: true } },
              shift: { select: { name: true } },
            },
          },
        },
      },
      // Optionally could pull recent exam results here if grading module is complete
      results: {
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          totalMarks: true,
          obtainedMarks: true,
          grade: true,
          exam: { select: { title: true } },
        },
      },
    },
  })

  if (!student) return errors.notFound('Student not found')

  return successResponse({
    activeEnrollment: student.enrollments[0] || null,
    recentResults: student.results,
  })
}
