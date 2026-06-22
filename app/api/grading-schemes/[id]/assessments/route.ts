import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createAssessmentSchema } from '@/lib/validation/academic'
import { assertAcademicYearEditable } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

/** Add an assessment to a grading component. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'create')
  if (denied) return denied

  const { id: schemeId } = await params
  const scheme = await prisma.academicGradingScheme.findUnique({
    where: { id: schemeId },
    include: { components: true },
  })
  if (!scheme) return errors.notFound('Grading scheme')

  try {
    await assertAcademicYearEditable(scheme.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  const body = await request.json()
  const parsed = createAssessmentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const component = scheme.components.find((c) => c.id === parsed.data.gradingComponentId)
  if (!component) return errors.forbidden('Component does not belong to this scheme')

  const assessment = await prisma.assessment.create({
    data: {
      gradingComponentId: parsed.data.gradingComponentId,
      title: parsed.data.title,
      dueDate: new Date(parsed.data.dueDate),
    },
  })

  return createdResponse(assessment)
}
