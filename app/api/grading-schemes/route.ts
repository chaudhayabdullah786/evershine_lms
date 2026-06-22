import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createGradingSchemeSchema } from '@/lib/validation/academic'
import { assertAcademicYearEditable, validateGradingWeights } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const academicYearId = searchParams.get('academicYearId')
  const classSectionId = searchParams.get('classSectionId')

  const schemes = await prisma.academicGradingScheme.findMany({
    where: {
      ...(academicYearId && { academicYearId }),
      ...(classSectionId && { classSectionId }),
    },
    include: {
      components: { orderBy: { orderIndex: 'asc' }, include: { assessments: true } },
      subject: true,
    },
  })

  return successResponse(schemes)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'create')
  if (denied) return denied

  const parsed = createGradingSchemeSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const weightCheck = validateGradingWeights(
    parsed.data.components.map((c) => ({ weightPercentage: c.weightPercentage }))
  )
  if (!weightCheck.valid) {
    return errors.validation({
      errors: [{ path: ['components'], message: `Weights must total 100% (got ${weightCheck.total})` }],
    } as never)
  }

  try {
    await assertAcademicYearEditable(parsed.data.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  const { components, ...schemeData } = parsed.data

  const scheme = await prisma.$transaction(async (tx) => {
    const created = await tx.academicGradingScheme.create({
      data: {
        ...schemeData,
        components: { create: components },
      },
      include: { components: true },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'AcademicGradingScheme',
        entityId: created.id,
        changes: schemeData,
      },
    })
    return created
  })

  return createdResponse(scheme)
}
