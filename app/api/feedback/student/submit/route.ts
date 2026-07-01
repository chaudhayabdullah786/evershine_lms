import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { submitTeacherFeedbackSchema } from '@/lib/validation/feedback'
import { getPendingTeachersForStudent } from '@/lib/feedback/engine'
import type { Prisma } from '@prisma/client'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const student = await prisma.student.findUnique({ where: { userId: session.user.id } })
  if (!student) return errors.notFound('Student')

  const parsed = submitTeacherFeedbackSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const cycle = await prisma.monthlyFeedbackCycle.findUnique({
    where: { id: parsed.data.cycleId },
  })
  if (!cycle?.isOpen) return errors.forbidden('This feedback period is closed')

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: {
      id: parsed.data.studentEnrollmentId,
      studentId: student.id,
      status: 'ACTIVE',
    },
    include: { classSection: true },
  })
  if (!enrollment) return errors.forbidden('Invalid enrollment')

  const pending = await getPendingTeachersForStudent(student.id, cycle.id)
  const allowed = pending.find((p) => p.teacherId === parsed.data.teacherId)
  if (!allowed) return errors.forbidden('You cannot submit feedback for this teacher')

  const teacherQuestions = await prisma.feedbackQuestion.findMany({
    where: { isActive: true, category: 'TEACHER' },
    select: { id: true },
  })
  const teacherQuestionIds = new Set(teacherQuestions.map((question) => question.id))
  const submittedQuestionIds = new Set(parsed.data.answers.map((answer) => answer.questionId))
  const includesInvalidQuestion = parsed.data.answers.some(
    (answer) => !teacherQuestionIds.has(answer.questionId)
  )

  if (
    teacherQuestionIds.size === 0 ||
    includesInvalidQuestion ||
    submittedQuestionIds.size !== teacherQuestionIds.size
  ) {
    return errors.validation({
      errors: [{ path: ['answers'], message: 'Answer all active teacher questions only' }],
    } as never)
  }

  const existing = await prisma.feedbackAnswer.findFirst({
    where: {
      targetTeacherId: parsed.data.teacherId,
      submission: {
        cycleId: cycle.id,
        submitterUserId: session.user.id,
      },
    },
    select: { id: true },
  })
  if (existing) return errors.conflict('Feedback already submitted for this teacher')

  const existingSubmission = await prisma.studentFeedbackSubmission.findUnique({
    where: {
      cycleId_submitterUserId: {
        cycleId: cycle.id,
        submitterUserId: session.user.id,
      },
    },
    select: { suggestions: true },
  })
  const existingSuggestions: Prisma.InputJsonObject =
    typeof existingSubmission?.suggestions === 'object' &&
    existingSubmission.suggestions &&
    !Array.isArray(existingSubmission.suggestions)
      ? Object.fromEntries(
          Object.entries(existingSubmission.suggestions).filter((entry): entry is [string, string] =>
            typeof entry[1] === 'string'
          )
        )
      : {}
  const suggestions: Prisma.InputJsonObject | undefined = parsed.data.comments
    ? { ...existingSuggestions, [parsed.data.teacherId]: parsed.data.comments }
    : Object.keys(existingSuggestions).length > 0
      ? existingSuggestions
      : undefined

  const feedback = await prisma.$transaction(async (tx) => {
    const submission = await tx.studentFeedbackSubmission.upsert({
      where: {
        cycleId_submitterUserId: {
          cycleId: cycle.id,
          submitterUserId: session.user.id,
        },
      },
      create: {
        cycleId: cycle.id,
        studentId: student.id,
        studentEnrollmentId: enrollment.id,
        campusId: enrollment.classSection.campusId,
        batchId: enrollment.classSection.batchId,
        submitterRole: 'STUDENT',
        submitterUserId: session.user.id,
        suggestions,
      },
      update: suggestions ? { suggestions } : {},
    })

    await tx.feedbackAnswer.createMany({
      data: parsed.data.answers.map((a) => ({
        submissionId: submission.id,
        questionId: a.questionId,
        targetTeacherId: parsed.data.teacherId,
        response: a.response,
      })),
      skipDuplicates: true,
    })
    return submission
  })

  return createdResponse({ id: feedback.id }, 'Feedback submitted')
}
