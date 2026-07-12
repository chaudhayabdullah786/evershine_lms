/**
 * POST /api/teacher-portal/results/[id]/declare
 *
 * Declares a TermResult — makes it visible on the student portal.
 * After declaration:
 *   1. Sets declarationStatus = DECLARED, declaredAt, declaredById
 *   2. Recalculates class positions for all DECLARED results in section on a best-effort basis
 *   3. Dispatches RESULT_PUBLISHED notification to the declared student on a best-effort basis
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import { dispatchBulkNotification } from '@/lib/notifications/dispatch'

type DeclaredResultPayload = {
  id: string
  studentId: string
  classSectionId: string
  examSessionId: string
  declarationStatus: 'DECLARED'
  declaredAt: string
}

function errorMentionsColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false

  const withMeta = error as { code?: string; meta?: { column?: unknown; field_name?: unknown; target?: unknown }; message?: string }
  const metaValues = [
    withMeta.meta?.column,
    withMeta.meta?.field_name,
    withMeta.meta?.target,
  ].filter(Boolean).map(String)

  return (
    withMeta.code === 'P2022' && metaValues.some((value) => value.includes(columnName))
  ) || String(withMeta.message ?? '').includes(columnName)
}

async function publishResult(resultId: string, declaredById: string, declaredAt: Date) {
  const select = {
    id: true,
    studentId: true,
    classSectionId: true,
    examSessionId: true,
    declarationStatus: true,
  } as const

  try {
    return await prisma.termResult.update({
      where: { id: resultId },
      data: {
        declarationStatus: 'DECLARED',
        declaredAt,
        declaredById,
      },
      select,
    })
  } catch (error) {
    if (!errorMentionsColumn(error, 'declaredById') && !errorMentionsColumn(error, 'declaredAt')) {
      throw error
    }

    console.warn('[RESULT_DECLARE_SCHEMA_FALLBACK]', error)
  }

  try {
    return await prisma.termResult.update({
      where: { id: resultId },
      data: {
        declarationStatus: 'DECLARED',
        declaredAt,
      },
      select,
    })
  } catch (error) {
    if (!errorMentionsColumn(error, 'declaredAt')) {
      throw error
    }

    console.warn('[RESULT_DECLARE_DECLARED_AT_FALLBACK]', error)
  }

  return prisma.termResult.update({
    where: { id: resultId },
    data: { declarationStatus: 'DECLARED' },
    select,
  })
}

async function recalculateDeclaredPositions(classSectionId: string, examSessionId: string) {
  const allDeclared = await prisma.termResult.findMany({
    where: {
      classSectionId,
      examSessionId,
      declarationStatus: 'DECLARED',
    },
    select: { id: true, overallPercentage: true },
  })

  const sorted = [...allDeclared].sort(
    (a, b) => Number(b.overallPercentage) - Number(a.overallPercentage)
  )

  for (let i = 0; i < sorted.length; i++) {
    await prisma.termResult.update({
      where: { id: sorted[i].id },
      data: { classPosition: i + 1 },
    })
  }
}

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

    // Publication is the critical action. Position recalculation and notifications
    // are useful follow-up work, but they must not keep a valid result hidden from
    // the student if a non-critical write fails in production.
    const declaredAt = new Date()
    const declared = await publishResult(id, session.user.id, declaredAt)

    try {
      await recalculateDeclaredPositions(declared.classSectionId, declared.examSessionId)
    } catch (positionError) {
      console.error('[RESULT_DECLARE_POSITIONS]', positionError)
    }

    // Notification delivery is best-effort and must never roll back publication.
    try {
      const student = await prisma.student.findUnique({
        where: { id: declared.studentId },
        select: { userId: true },
      })
      if (student?.userId) {
        await dispatchBulkNotification({
          userIds: [student.userId],
          title: 'Result Published',
          message: 'Your result has been declared. Check your portal.',
          type: 'RESULT_PUBLISHED',
          relatedId: id,
        })
      }
    } catch (notificationError) {
      console.error('[RESULT_DECLARE_NOTIFY]', notificationError)
    }

    const payload: DeclaredResultPayload = {
      id: declared.id,
      studentId: declared.studentId,
      classSectionId: declared.classSectionId,
      examSessionId: declared.examSessionId,
      declarationStatus: 'DECLARED',
      declaredAt: declaredAt.toISOString(),
    }

    return successResponse(payload, 'Result declared successfully')
  } catch (err) {
    console.error('[RESULT_DECLARE]', err)
    return errors.internal()
  }
}
