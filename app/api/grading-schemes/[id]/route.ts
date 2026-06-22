import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { assertAcademicYearEditable } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const patchSchema = z.object({
  isPublished: z.boolean().optional(),
  name: z.string().min(2).optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'read')
  if (denied) return denied

  const { id } = await params
  const scheme = await prisma.academicGradingScheme.findUnique({
    where: { id },
    include: {
      subject: true,
      classSection: { include: { campus: true, batch: true } },
      components: { orderBy: { orderIndex: 'asc' }, include: { assessments: true } },
    },
  })
  if (!scheme) return errors.notFound('Grading scheme')
  return successResponse(scheme)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'update')
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.academicGradingScheme.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Grading scheme')

  try {
    await assertAcademicYearEditable(existing.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.academicGradingScheme.update({ where: { id }, data: parsed.data })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: parsed.data.isPublished ? 'PUBLISH' : 'UPDATE',
        entityType: 'AcademicGradingScheme',
        entityId: id,
        changes: parsed.data,
      },
    })
    return row
  })

  return successResponse(updated)
}
