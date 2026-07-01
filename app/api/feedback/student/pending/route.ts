import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import {
  ensureFeedbackQuestions,
  getOpenFeedbackCycleForStudents,
  getPendingTeachersForStudent,
} from '@/lib/feedback/engine'

/** Student: open monthly cycle + teachers still needing feedback. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const student = await prisma.student.findUnique({ where: { userId: session.user.id } })
  if (!student) return errors.notFound('Student')

  await ensureFeedbackQuestions()
  const cycle = await getOpenFeedbackCycleForStudents()
  if (!cycle) {
    return successResponse({ required: false, cycle: null, pending: [], questions: [] })
  }

  const pending = await getPendingTeachersForStudent(student.id, cycle.id)
  const questions = await prisma.feedbackQuestion.findMany({
    where: { isActive: true, category: 'TEACHER' },
    orderBy: { orderIndex: 'asc' },
  })

  return successResponse({
    required: pending.length > 0,
    cycle: { id: cycle.id, label: cycle.label, year: cycle.year, month: cycle.month },
    pending,
    questions,
  })
}
