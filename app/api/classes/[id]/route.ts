/**
 * PATCH /api/classes/[id] — update class (campus, batch, etc.)
 * DELETE /api/classes/[id] — soft-deactivate class
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { createClassSchema } from '@/lib/validation/batch'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'update')) return errors.forbidden()

  const { id } = await params
  const existing = await prisma.class.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Class')

  if (session.user.role === 'ADMIN' && session.user.campusId && existing.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = createClassSchema.partial().safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  if (data.campusId && data.batchId) {
    const batch = await prisma.batch.findUnique({ where: { id: data.batchId } })
    if (batch && batch.campusId !== data.campusId) {
      return errors.validation({
        errors: [{ path: ['batchId'], message: 'Batch must belong to the target campus' }],
      } as never)
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const cls = await tx.class.update({ where: { id }, data })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Class',
        entityId: id,
        changes: data,
      },
    })
    return cls
  })

  return successResponse(updated, 'Class updated successfully')
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'classes', 'delete')) return errors.forbidden()

  const { id } = await params
  const existing = await prisma.class.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Class')

  await prisma.$transaction(async (tx) => {
    await tx.class.update({ where: { id }, data: { isActive: false } })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Class',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Class deactivated successfully')
}
