/**
 * GET    /api/batches/[id]  — fetch single batch
 * PATCH  /api/batches/[id]  — partial update
 * DELETE /api/batches/[id]  — soft delete
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { updateBatchSchema } from '@/lib/validation/batch'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'batches', 'read')) return errors.forbidden()

  const { id } = await params

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      campus: true,
      classes: { where: { isActive: true } },
      houses: { where: { isActive: true } },
    },
  })

  if (!batch) return errors.notFound('Batch')

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== batch.campusId) {
    return errors.forbidden()
  }

  return successResponse(batch)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'batches', 'update')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.batch.findUnique({ where: { id }, select: { id: true, campusId: true } })
  if (!existing) return errors.notFound('Batch')

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== existing.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = updateBatchSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const updated = await prisma.$transaction(async (tx) => {
    const batch = await tx.batch.update({
      where: { id },
      data: parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Batch',
        entityId: id,
        changes: parsed.data,
      },
    })

    return batch
  })

  return successResponse(updated, 'Batch updated successfully')
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'batches', 'delete')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.batch.findUnique({ where: { id }, select: { id: true, campusId: true } })
  if (!existing) return errors.notFound('Batch')

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== existing.campusId) {
    return errors.forbidden()
  }

  await prisma.$transaction(async (tx) => {
    await tx.batch.update({
      where: { id },
      data: { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Batch',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Batch deactivated successfully')
}
