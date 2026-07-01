import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { FeedbackLikertResponse, Role } from '@prisma/client'

const guardianFeedbackSchema = z.object({
  cycleId: z.string(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      response: z.enum(['STRONGLY_AGREE', 'AGREE', 'NEUTRAL', 'DISAGREE']),
    })
  ).min(1, 'At least one answer is required'),
  suggestions: z.record(z.string()).optional().nullable(),
})

/** Guardian submits monthly service feedback (LMS + Academy services). */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  if (!['PARENT', 'GUARDIAN'].includes(session.user.role)) {
    return errors.forbidden('Only parents and guardians can submit service feedback.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = guardianFeedbackSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  // Verify cycle is open
  const cycle = await prisma.monthlyFeedbackCycle.findUnique({
    where: { id: parsed.data.cycleId },
  })
  if (!cycle?.isOpen) {
    return errors.forbidden('This feedback period is closed.')
  }

  // Check for duplicate submission
  const existing = await prisma.studentFeedbackSubmission.findUnique({
    where: {
      cycleId_submitterUserId: {
        cycleId: cycle.id,
        submitterUserId: session.user.id,
      },
    },
  })
  if (existing) {
    return errors.conflict('You have already submitted feedback for this period.')
  }

  // Resolve guardian profile to get campusId/batchId from linked children
  const guardian = await prisma.guardian.findUnique({
    where: { userId: session.user.id },
    include: {
      students: {
        where: { isActive: true },
        take: 1,
        include: {
          campus: { select: { id: true } },
          batch: { select: { id: true } },
        },
      },
    },
  })

  // Fallback: try parent relation if guardian not found
  let campusId = guardian?.students[0]?.campus?.id ?? null
  let batchId = guardian?.students[0]?.batch?.id ?? null

  if (!guardian) {
    const parentLink = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: {
        students: {
          where: { isActive: true },
          take: 1,
          include: {
            campus: { select: { id: true } },
            batch: { select: { id: true } },
          },
        },
      },
    })
    if (parentLink?.students[0]) {
      campusId = parentLink.students[0].campus?.id ?? null
      batchId = parentLink.students[0].batch?.id ?? null
    }
  }

  if (!campusId || !batchId) {
    return errors.forbidden('Guardian account is not linked to an active student.')
  }

  // Validate all questions exist and are service-type
  const questionIds = parsed.data.answers.map((a) => a.questionId)
  const validQuestions = await prisma.feedbackQuestion.findMany({
    where: {
      id: { in: questionIds },
      isActive: true,
      category: { in: ['LMS_SERVICES', 'ACADEMY_SERVICES'] },
    },
  })

  if (validQuestions.length !== questionIds.length) {
    return errors.validation({ errors: [{ path: ['answers'], message: 'Some questions are invalid or not service-type questions.' }] } as never)
  }

  const submission = await prisma.$transaction(async (tx) => {
    const row = await tx.studentFeedbackSubmission.create({
      data: {
        cycleId: cycle.id,
        submitterUserId: session.user.id,
        submitterRole: session.user.role as Role,
        guardianId: guardian?.id ?? undefined,
        campusId,
        batchId,
        suggestions: parsed.data.suggestions ?? undefined,
      },
    })

    await tx.feedbackAnswer.createMany({
      data: parsed.data.answers.map((a) => ({
        submissionId: row.id,
        questionId: a.questionId,
        response: a.response as FeedbackLikertResponse,
        // No targetTeacherId — guardian feedback is about services, not teachers
      })),
    })

    return row
  })

  return createdResponse(
    { id: submission.id },
    'Thank you for your feedback! Your input helps us improve the academy.'
  )
}
