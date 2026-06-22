import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { calculateWeightedPercentage } from '@/lib/academic/engine'
import { mapGradeLetter } from '@/lib/academic/grades'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const querySchema = z.object({
  studentEnrollmentId: z.string().cuid(),
  gradingSchemeId: z.string().cuid(),
})

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'read')
  if (denied) return denied

  const parsed = querySchema.safeParse({
    studentEnrollmentId: new URL(request.url).searchParams.get('studentEnrollmentId'),
    gradingSchemeId: new URL(request.url).searchParams.get('gradingSchemeId'),
  })
  if (!parsed.success) return errors.validation(parsed.error)

  const scheme = await prisma.academicGradingScheme.findUnique({
    where: { id: parsed.data.gradingSchemeId },
    include: { components: { include: { assessments: { include: { scores: true } } } } },
  })
  if (!scheme) return errors.notFound('Grading scheme')

  const components = scheme.components.map((comp) => {
    const obtained = comp.assessments.reduce((sum, a) => {
      const score = a.scores.find((s) => s.studentEnrollmentId === parsed.data.studentEnrollmentId)
      return sum + (score?.obtainedMarks ?? 0)
    }, 0)
    return {
      maxMarks: comp.maxMarks,
      weightPercentage: comp.weightPercentage,
      obtained,
    }
  })

  const percentage = calculateWeightedPercentage(components)
  const grade = mapGradeLetter(percentage)

  return successResponse({
    studentEnrollmentId: parsed.data.studentEnrollmentId,
    gradingSchemeId: scheme.id,
    percentage,
    grade,
    components,
  })
}
