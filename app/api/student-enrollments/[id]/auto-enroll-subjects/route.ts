/**
 * POST /api/student-enrollments/[id]/auto-enroll-subjects
 *
 * Admin-triggered auto-enrollment of mandatory subjects for a student's
 * FIXED-curriculum section enrollment. This replaces the previous pattern
 * of auto-enrolling on every GET request (which created phantom assignments).
 *
 * WHY a separate endpoint: auto-enrollment is a write operation with side-effects
 * (creates SubjectEnrollment records). It must be an explicit admin action, not
 * an implicit read-path side-effect that fires on every portal page load.
 *
 * Access: SUPER_ADMIN, ADMIN only.
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { autoEnrollMandatorySubjects } from '@/lib/academic/enrollment'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) return errors.forbidden()

  const { id: enrollmentId } = await params

  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      classSection: { select: { curriculumMode: true } },
      subjectEnrollments: { select: { id: true } },
    },
  })
  if (!enrollment) return errors.notFound('StudentEnrollment')

  if (enrollment.classSection.curriculumMode !== 'FIXED') {
    return errors.validation({
      errors: [{ path: [], message: 'Auto-enrollment only applies to FIXED curriculum sections' }],
    } as never)
  }

  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return errors.notFound('Active academic year')

  const created = await autoEnrollMandatorySubjects(
    enrollmentId,
    enrollment.classSectionId,
    activeYear.id
  )

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'SubjectEnrollment',
      entityId: enrollmentId,
      changes: { trigger: 'auto-enroll-mandatory', enrollmentId, count: created },
    },
  })

  return successResponse(
    { enrollmentId, subjectsCreated: created },
    `Auto-enrolled mandatory subjects successfully`
  )
}
