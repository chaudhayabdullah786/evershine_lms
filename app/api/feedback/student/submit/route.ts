import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { submitTeacherFeedbackSchema } from '@/lib/validation/feedback'
import { getPendingTeachersForStudent } from '@/lib/feedback/engine'

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

  const questionCount = await prisma.feedbackQuestion.count({ where: { isActive: true } })
  if (parsed.data.answers.length < questionCount) {
    return errors.validation({
      errors: [{ path: ['answers'], message: 'Answer all questions' }],
    } as never)
  }

  const existing = await prisma.teacherMonthlyFeedback.findUnique({
    where: {
      cycleId_teacherId_studentId: {
        cycleId: cycle.id,
        teacherId: parsed.data.teacherId,
        studentId: student.id,
      },
    },
  })
  if (existing) return errors.conflict('Feedback already submitted for this teacher')

  const feedback = await prisma.$transaction(async (tx) => {
    const row = await tx.teacherMonthlyFeedback.create({
      data: {
        cycleId: cycle.id,
        teacherId: parsed.data.teacherId,
        studentId: student.id,
        studentEnrollmentId: enrollment.id,
        campusId: enrollment.classSection.campusId,
        batchId: enrollment.classSection.batchId,
        classSectionId: enrollment.classSectionId,
        comments: parsed.data.comments,
      },
    })
    await tx.teacherMonthlyFeedbackAnswer.createMany({
      data: parsed.data.answers.map((a) => ({
        feedbackId: row.id,
        questionId: a.questionId,
        response: a.response,
      })),
    })
    return row
  })

  return createdResponse({ id: feedback.id }, 'Feedback submitted')
}
