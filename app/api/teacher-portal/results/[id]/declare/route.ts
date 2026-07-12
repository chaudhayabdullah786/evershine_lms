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
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
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

    const canAccessSection = await teacherCanAccessClassSection(teacher.id, termResult.classSectionId)
    if (!canAccessSection) return errors.forbidden('You are not assigned to this class section')

    if (termResult.declarationStatus === 'DECLARED') {
      return errors.badRequest('Result is already declared')
    }

    const subjectResultCount = await prisma.subjectResult.count({
      where: { termResultId: id },
    })
    if (subjectResultCount === 0) {
      return errors.badRequest('Add at least one subject result before declaring this result.')
    }

    // Validate: no subject can remain pending when the result becomes visible to students.
    const pendingSubjects = await prisma.subjectResult.findMany({
      where: {
        termResultId: id,
        resultStatus: 'Pending',
        isAbsent: false,
        isNotApplicable: false,
      },
      include: {
        subjectOffering: {
          include: { subject: { select: { name: true, code: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (pendingSubjects.length > 0) {
      const subjectNames = pendingSubjects
        .map((subjectResult) => subjectResult.subjectOffering?.subject?.name ?? subjectResult.subjectOffering?.subject?.code ?? 'Unnamed subject')
        .slice(0, 5)
        .join(', ')
      const extraCount = Math.max(0, pendingSubjects.length - 5)
      return errors.badRequest(
        `Complete pending marks before declaring: ${subjectNames}${extraCount ? ` and ${extraCount} more` : ''}. Enter marks, or mark the subject Absent/N/A. The draft remains saved and hidden from students.`
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

      return updated
    })

    // Notification delivery is best-effort and must never roll back publication.
    try {
      const userIds = await getStudentUserIdsForSection(declared.classSectionId)
      if (userIds.length > 0) await dispatchBulkNotification({ userIds, title: 'Result Published', message: 'Your result has been declared. Check your portal.', type: 'RESULT_PUBLISHED', relatedId: id })
    } catch (notificationError) {
      console.error('[RESULT_DECLARE_NOTIFY]', notificationError)
    }

    return successResponse(declared, 'Result declared successfully')
  } catch (err) {
    console.error('[RESULT_DECLARE]', err)
    return errors.internal()
  }
}
