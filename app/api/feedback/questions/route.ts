import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createFeedbackQuestionSchema } from '@/lib/validation/feedback'
import { ensureFeedbackQuestions } from '@/lib/feedback/engine'
import type { Role } from '@prisma/client'

export async function GET() {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  if (!['SUPER_ADMIN', 'ADMIN', 'STUDENT'].includes(session.user.role)) {
    return errors.forbidden()
  }

  await ensureFeedbackQuestions()
  const questions = await prisma.feedbackQuestion.findMany({
    orderBy: { orderIndex: 'asc' },
  })
  return successResponse(questions)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'teachers', 'update')
  if (denied) return denied

  const parsed = createFeedbackQuestionSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const maxOrder = await prisma.feedbackQuestion.aggregate({ _max: { orderIndex: true } })
  const question = await prisma.feedbackQuestion.create({
    data: {
      text: parsed.data.text,
      orderIndex: parsed.data.orderIndex ?? (maxOrder._max.orderIndex ?? 0) + 1,
    },
  })

  return createdResponse(question)
}
