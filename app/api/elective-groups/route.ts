import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createElectiveGroupSchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'class_sections', 'read')
  if (denied) return denied

  const classSectionId = new URL(request.url).searchParams.get('classSectionId')
  if (!classSectionId) {
    return errors.validation({
      errors: [{ path: ['classSectionId'], message: 'classSectionId is required' }],
    } as never)
  }

  const groups = await prisma.electiveGroup.findMany({
    where: { classSectionId },
    include: {
      classSection: { select: { className: true, sectionName: true } },
      offerings: {
        include: { subject: { select: { name: true, code: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  return successResponse(groups)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'class_sections', 'create')
  if (denied) return denied

  const parsed = createElectiveGroupSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  if (parsed.data.maxSelections < parsed.data.minSelections) {
    return errors.validation({
      errors: [{ path: ['maxSelections'], message: 'maxSelections must be >= minSelections' }],
    } as never)
  }

  const section = await prisma.classSection.findUnique({
    where: { id: parsed.data.classSectionId },
    select: { curriculumMode: true },
  })
  if (!section) return errors.notFound('Class section')
  if (section.curriculumMode !== 'ELECTIVE') {
    return errors.forbidden('Elective groups are only for ELECTIVE curriculum sections')
  }

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.electiveGroup.create({ data: parsed.data })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'ElectiveGroup',
        entityId: created.id,
        changes: parsed.data,
      },
    })
    return created
  })

  return createdResponse(group)
}
