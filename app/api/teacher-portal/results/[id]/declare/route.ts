/**
 * POST /api/teacher-portal/results/[id]/declare
 *
 * Declares a TermResult — makes it visible on the student portal.
 * After declaration:
 *   1. Sets declarationStatus = DECLARED, declaredAt, declaredById
 *   2. Recalculates class positions for all DECLARED results in section
 *   3. Dispatches RESULT_PUBLISHED notification to all active students in section
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import {
  dispatchBulkNotification,
  getStudentUserIdsForSection,
} from '@/lib/notifications/dispatch'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params

    const termResult = await prisma.termResult.findUnique({
      where: { id },
      include: {
        classSection: { select: { className: true, sectionName: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    })

    if (!termResult) return errors.notFound('Result')

    const teachingSection = await prisma.subjectOffering.findFirst({
      where: { classSectionId: termResult.classSectionId, teacherId: teacher.id },
    })
    if (!teachingSection) return errors.forbidden()

    if (termResult.declarationStatus === 'DECLARED') {
      return errors.badRequest('Result is already declared')
    }

    // Validate: no SubjectResults in Pending state (obtainedMarks null without isAbsent/isNA)
    const pendingSubjects = await prisma.subjectResult.findMany({
      where: {
        termResultId: id,
        resultStatus: 'Pending',
        isAbsent: false,
        isNotApplicable: false,
      },
    })

    if (pendingSubjects.length > 0) {
      return errors.badRequest(
        `${pendingSubjects.length} subject(s) still have pending marks. Declare or mark as "Input Decide Later" first.`
      )
    }

    // Declare + notify in a single transaction
    const declared = await prisma.$transaction(async (tx) => {
      const updated = await tx.termResult.update({
        where: { id },
        data: {
          declarationStatus: 'DECLARED',
          declaredAt: new Date(),
          declaredById: session.user.id,
        },
        include: { classSection: true },
      })

      // Recalculate positions for all declared results in section
      const allDeclared = await tx.termResult.findMany({
        where: {
          classSectionId: updated.classSectionId,
          examSessionId: updated.examSessionId,
          declarationStatus: 'DECLARED',
        },
        select: { id: true, overallPercentage: true },
      })

      const sorted = [...allDeclared].sort(
        (a, b) => Number(b.overallPercentage) - Number(a.overallPercentage)
      )
      for (let i = 0; i < sorted.length; i++) {
        await tx.termResult.update({
          where: { id: sorted[i].id },
          data: { classPosition: i + 1 },
        })
      }

      // Dispatch to all active students in section
      const userIds = await getStudentUserIdsForSection(updated.classSectionId)
      if (userIds.length > 0) {
        await dispatchBulkNotification({
          userIds,
          title: 'Result Published',
          message: `Your result for ${updated.classSection.className}-${updated.classSection.sectionName} (${updated.examSessionId}) has been declared. Check your portal.`,
          type: 'RESULT_PUBLISHED',
          relatedId: id,
          tx,
        })
      }

      return updated
    })

    return successResponse(declared, 'Result declared successfully')
  } catch (err) {
    console.error('[RESULT_DECLARE]', err)
    return errors.internal()
  }
}
