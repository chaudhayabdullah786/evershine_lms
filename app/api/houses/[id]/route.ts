/**
 * GET    /api/houses/[id]
 * PATCH  /api/houses/[id]
 * DELETE /api/houses/[id]
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { updateHouseSchema } from '@/lib/validation/batch'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'houses', 'read')) return errors.forbidden()

  const { id } = await params

  const house = await prisma.house.findUnique({
    where: { id },
    include: {
      batch: { select: { campusId: true, name: true } },
      captain: { select: { id: true, firstName: true, lastName: true } },
      viceCaptain: { select: { id: true, firstName: true, lastName: true } },
      students: { where: { isActive: true }, select: { id: true, firstName: true, lastName: true } },
    },
  })

  if (!house) return errors.notFound('House')

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== house.batch.campusId) {
    return errors.forbidden()
  }

  return successResponse(house)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'houses', 'update')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.house.findUnique({
    where: { id },
    select: { id: true, batch: { select: { campusId: true } } }
  })
  if (!existing) return errors.notFound('House')

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== existing.batch.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = updateHouseSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const updated = await prisma.$transaction(async (tx) => {
    const house = await tx.house.update({
      where: { id },
      data: parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'House',
        entityId: id,
        changes: parsed.data,
      },
    })

    return house
  })

  return successResponse(updated, 'House updated successfully')
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'houses', 'delete')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.house.findUnique({
    where: { id },
    select: { id: true, batch: { select: { campusId: true } } }
  })
  if (!existing) return errors.notFound('House')

  if (session.user.role !== 'SUPER_ADMIN' && session.user.campusId !== existing.batch.campusId) {
    return errors.forbidden()
  }

  await prisma.$transaction(async (tx) => {
    await tx.house.update({
      where: { id },
      data: { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'House',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'House deactivated successfully')
}
