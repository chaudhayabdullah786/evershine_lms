import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession } from '@/lib/academic/api-helpers'
import { getActiveAcademicYear } from '@/lib/academic/engine'

/**
 * POST /api/admin/backfill-student-enrollments
 *
 * Idempotent bulk backfill utility to map all direct Student records (Student.classId / Student.section)
 * into active StudentEnrollment records under the current active AcademicYear.
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return errors.forbidden('Only Superadmin/Admin can trigger backfill.')
  }

  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return errors.badRequest('No active academic year found.')

  const students = await prisma.student.findMany({
    select: {
      id: true,
      rollNumber: true,
      classId: true,
      campusId: true,
      batchId: true,
      section: true,
      lastClassPassed: true,
    },
  })

  const classSections = await prisma.classSection.findMany({
    where: { isActive: true },
    select: {
      id: true,
      campusId: true,
      batchId: true,
      className: true,
      sectionName: true,
      grade: true,
    },
  })

  const legacyClasses = await prisma.class.findMany({
    select: {
      id: true,
      campusId: true,
      batchId: true,
      grade: true,
      section: true,
    },
  })

  let enrolledCount = 0

  for (const st of students) {
    let targetSectionId: string | null = null

    if (st.classId) {
      // Check if classId matches a ClassSection directly
      const directCs = classSections.find((cs) => cs.id === st.classId)
      if (directCs) {
        targetSectionId = directCs.id
      } else {
        // Check if classId matches a legacy Class row
        const leg = legacyClasses.find((lc) => lc.id === st.classId)
        if (leg) {
          const matchedCs = classSections.find(
            (cs) =>
              cs.campusId === leg.campusId &&
              cs.batchId === leg.batchId &&
              (leg.grade ? cs.grade === leg.grade : true) &&
              (leg.section ? cs.sectionName === leg.section : true)
          )
          if (matchedCs) targetSectionId = matchedCs.id
        }
      }
    }

    // Fallback: match by student's campusId, batchId, section
    if (!targetSectionId) {
      const matchedByScope = classSections.find(
        (cs) =>
          cs.campusId === st.campusId &&
          cs.batchId === st.batchId &&
          (st.section ? cs.sectionName === st.section : true) &&
          (st.lastClassPassed ? cs.grade === st.lastClassPassed : true)
      )
      if (matchedByScope) targetSectionId = matchedByScope.id
    }

    if (targetSectionId) {
      try {
        await prisma.studentEnrollment.upsert({
          where: {
            studentId_academicYearId_classSectionId: {
              studentId: st.id,
              academicYearId: activeYear.id,
              classSectionId: targetSectionId,
            },
          },
          create: {
            studentId: st.id,
            academicYearId: activeYear.id,
            classSectionId: targetSectionId,
            rollNumber: st.rollNumber || '1',
            status: 'ACTIVE',
          },
          update: {
            status: 'ACTIVE',
          },
        })
        enrolledCount++
      } catch {
        // Ignore duplicate collisions
      }
    }
  }

  return successResponse({
    totalStudentsProcessed: students.length,
    enrolledCount,
    activeYear,
  }, 'Student enrollments successfully backfilled across all active sections.')
}
