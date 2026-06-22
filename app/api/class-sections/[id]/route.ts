import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  const denied = requirePermission(session.user.role as Role, 'class_sections', 'delete')
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.classSection.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Class section')

  if (
    session.user.role !== 'SUPER_ADMIN' &&
    session.user.campusId &&
    existing.campusId !== session.user.campusId
  ) {
    return errors.forbidden('You can only delete sections from your campus.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.classSection.update({
      where: { id },
      data: { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'ClassSection',
        entityId: id,
        changes: { status: 'deactivated', campusId: existing.campusId },
      },
    })
  })

  return successResponse({ id }, 'Class section deleted successfully')
}
