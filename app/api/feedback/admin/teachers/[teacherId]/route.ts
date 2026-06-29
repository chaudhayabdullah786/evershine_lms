import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission, campusScope } from '@/lib/academic/api-helpers'
import { summarizeLikertAnswers } from '@/lib/feedback/engine'
import type { Role } from '@prisma/client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'teachers', 'read')
  if (denied) return denied

  const { teacherId } = await params
  const cycleId = new URL(request.url).searchParams.get('cycleId')
  if (!cycleId) {
    return errors.validation({
      errors: [{ path: ['cycleId'], message: 'cycleId is required' }],
    } as never)
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      campus: { select: { name: true } },
      batch: { select: { name: true } },
    },
  })
  if (!teacher) return errors.notFound('Teacher')

  const campusId = campusScope(session.user.role as Role, session.user.campusId as string)

  const feedbacks = await prisma.studentFeedbackSubmission.findMany({
    where: {
      cycleId,
      ...(campusId ? { campusId } : {}),
      answers: { some: { targetTeacherId: teacherId } },
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          registrationNumber: true,
        },
      },
      enrollment: {
        include: {
          classSection: { include: { shift: true, campus: true, batch: true } },
        },
      },
      answers: { where: { targetTeacherId: teacherId }, include: { question: true } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  const allAnswers = feedbacks.flatMap((f) => f.answers)
  const summary = summarizeLikertAnswers(allAnswers)

  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'

  return successResponse({
    teacher,
    summary,
    submissions: isSuperAdmin ? [] : feedbacks.map((f) => ({
      id: f.id,
      submittedAt: f.submittedAt,
      comments: typeof f.suggestions === 'object' && f.suggestions && !Array.isArray(f.suggestions) ? (f.suggestions as Record<string, unknown>)[teacherId] ?? null : null,
      student: f.student,
      placement: {
        campus: f.enrollment.classSection.campus.name,
        batch: f.enrollment.classSection.batch.name,
        section: `${f.enrollment.classSection.className}-${f.enrollment.classSection.sectionName}`,
        shift: f.enrollment.classSection.shift.name,
      },
      answers: f.answers.map((a) => ({
        question: a.question.text,
        response: a.response,
      })),
    })),
  })
}
