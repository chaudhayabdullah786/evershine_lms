import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { ensureMonthlyFeedbackCycles } from '@/lib/feedback/engine'

/**
 * Guardian feedback pending check.
 * Returns the open cycle, whether feedback was already submitted,
 * and questions filtered to LMS_SERVICES + ACADEMY_SERVICES.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  if (!['PARENT', 'GUARDIAN'].includes(session.user.role)) {
    return errors.forbidden()
  }

  // Ensure cycles exist
  await ensureMonthlyFeedbackCycles()

  const now = new Date()
  const cycle = await prisma.monthlyFeedbackCycle.findFirst({
    where: {
      isOpen: true,
      opensAt: { lte: now },
      OR: [{ closesAt: null }, { closesAt: { gte: now } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!cycle) {
    return successResponse({ required: false, cycle: null, questions: [] })
  }

  // Check if already submitted for this cycle
  const existing = await prisma.studentFeedbackSubmission.findUnique({
    where: {
      cycleId_submitterUserId: {
        cycleId: cycle.id,
        submitterUserId: session.user.id,
      },
    },
  })

  if (existing) {
    return successResponse({ required: false, cycle: { id: cycle.id, label: cycle.label }, submitted: true, questions: [] })
  }

  // Fetch guardian-specific questions (LMS_SERVICES + ACADEMY_SERVICES only)
  const questions = await prisma.feedbackQuestion.findMany({
    where: {
      isActive: true,
      category: { in: ['LMS_SERVICES', 'ACADEMY_SERVICES'] },
    },
    orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }],
  })

  return successResponse({
    required: questions.length > 0,
    cycle: { id: cycle.id, label: cycle.label },
    submitted: false,
    questions,
  })
}
