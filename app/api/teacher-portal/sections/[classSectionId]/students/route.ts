/**
 * GET /api/teacher-portal/sections/[classSectionId]/students
 *
 * Returns student list for a class section.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getOrSyncSectionEnrollments } from '@/lib/academic/roster-helper'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classSectionId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const { classSectionId } = await params

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const canAccess = await teacherCanAccessClassSection(teacher.id, classSectionId)
    if (!canAccess) return errors.forbidden('You are not assigned to this class section')

    let enrollments = await prisma.studentEnrollment.findMany({
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
      orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
    })

    // Migrated campuses can still have active Student records without a
    // corresponding StudentEnrollment row. Reuse the roster resolver used by
    // attendance/daily scores so every teacher workflow sees the same roster
    // and the enrollment is safely synchronized to the active year.
    if (enrollments.length === 0) {
      const activeYear = await getActiveAcademicYear()
      const resolved = await getOrSyncSectionEnrollments(classSectionId, activeYear?.id)
      enrollments = resolved.enrollments as typeof enrollments
    }

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
