import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createAssessmentSchema, submitAssessmentScoreSchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'read')
  if (denied) return denied

  const gradingComponentId = new URL(request.url).searchParams.get('gradingComponentId')
  const assessments = await prisma.assessment.findMany({
    where: gradingComponentId ? { gradingComponentId } : undefined,
    include: { scores: true, gradingComponent: true },
  })
  return successResponse(assessments)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'create')
  if (denied) return denied

  const body = await request.json()
  if (body.obtainedMarks !== undefined) {
    return submitScore(session.user.id, session.user.role as Role, body)
  }

  const parsed = createAssessmentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const assessment = await prisma.assessment.create({
    data: {
      gradingComponentId: parsed.data.gradingComponentId,
      title: parsed.data.title,
      dueDate: new Date(parsed.data.dueDate),
    },
  })

  return createdResponse(assessment)
}

async function submitScore(userId: string, role: Role, body: unknown) {
  const parsed = submitAssessmentScoreSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const assessment = await prisma.assessment.findUnique({
    where: { id: parsed.data.assessmentId },
    include: { gradingComponent: { include: { gradingScheme: true } } },
  })
  if (!assessment) return errors.notFound('Assessment')
  const component = assessment.gradingComponent

  if (parsed.data.obtainedMarks > component.maxMarks) {
    return errors.validation({
      errors: [{ path: ['obtainedMarks'], message: `Marks cannot exceed ${component.maxMarks}` }],
    } as never)
  }

  if (assessment.gradingComponent.gradingScheme.isPublished) {
    return errors.forbidden('Cannot edit scores on published grading scheme')
  }

  const score = await prisma.$transaction(async (tx) => {
    const row = await tx.assessmentScore.upsert({
      where: {
        assessmentId_studentEnrollmentId: {
          assessmentId: parsed.data.assessmentId,
          studentEnrollmentId: parsed.data.studentEnrollmentId,
        },
      },
      create: {
        assessmentId: parsed.data.assessmentId,
        studentEnrollmentId: parsed.data.studentEnrollmentId,
        obtainedMarks: parsed.data.obtainedMarks,
      },
      update: { obtainedMarks: parsed.data.obtainedMarks },
    })
    await tx.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        entityType: 'AssessmentScore',
        entityId: row.id,
        changes: parsed.data,
      },
    })
    return row
  })

  return successResponse(score)
}
