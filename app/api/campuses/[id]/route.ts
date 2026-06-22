/**
 * GET    /api/campuses/[id]  — fetch single campus
 * PATCH  /api/campuses/[id]  — partial update
 * DELETE /api/campuses/[id]  — soft delete
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { updateCampusSchema } from '@/lib/validation/batch'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'campuses', 'read')) return errors.forbidden()

  const { id } = await params

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== id) {
    return errors.forbidden()
  }

  const campus = await prisma.campus.findUnique({
    where: { id },
    include: {
      batches: { where: { isActive: true } },
    },
  })

  if (!campus) return errors.notFound('Campus')

  return successResponse(campus)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'campuses', 'update')) return errors.forbidden()

  const { id } = await params

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== id) {
    return errors.forbidden()
  }

  const existing = await prisma.campus.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return errors.notFound('Campus')

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = updateCampusSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const updated = await prisma.$transaction(async (tx) => {
    const campus = await tx.campus.update({
      where: { id },
      data: parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Campus',
        entityId: id,
        changes: parsed.data,
      },
    })

    return campus
  })

  return successResponse(updated, 'Campus updated successfully')
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'campuses', 'delete')) return errors.forbidden()

  const { id } = await params

  if (session.user.role !== 'SUPER_ADMIN') {
    return errors.forbidden()
  }

  const existing = await prisma.campus.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return errors.notFound('Campus')

  await prisma.$transaction(async (tx) => {
    await tx.campus.update({
      where: { id },
      data: { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Campus',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Campus deactivated successfully')
}
