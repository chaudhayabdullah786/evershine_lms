/**
 * GET    /api/teachers/[id]  — fetch single teacher with relations
 * PATCH  /api/teachers/[id]  — partial update
 * DELETE /api/teachers/[id]  — soft delete (sets isActive=false)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { updateTeacherSchema } from '@/lib/validation/teacher'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'teachers', 'read')) return errors.forbidden()

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: {
      campus: true,
      batch: true,
      house: true,
      classes: { include: { class: true } },
      subjects: { include: { subject: true } },
      timetable: { include: { class: true } },
      attendance: { orderBy: { date: 'desc' }, take: 30 },
    },
  })

  if (!teacher) return errors.notFound('Teacher')

  // Scoping: If user is TEACHER, they can only view their own profile
  if (session.user.role === 'TEACHER' && teacher.userId !== session.user.id) {
    return errors.forbidden()
  }

  // Scoping: If user is ADMIN, they can only view teachers in their campus
  if (session.user.role === 'ADMIN' && teacher.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  return successResponse(teacher)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'teachers', 'update')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.teacher.findUnique({ where: { id }, select: { id: true, campusId: true } })
  if (!existing) return errors.notFound('Teacher')

  if (session.user.role === 'ADMIN' && existing.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = updateTeacherSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { dateOfBirth, joiningDate, campusId, batchId, houseId, ...rest } = parsed.data

  // ADMIN cannot transfer teachers to another campus
  if (
    session.user.role === 'ADMIN' &&
    campusId &&
    campusId !== session.user.campusId
  ) {
    return errors.forbidden('Cannot move a teacher to a different campus')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const teacher = await tx.teacher.update({
      where: { id },
      data: {
        ...rest,
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(joiningDate && { joiningDate: new Date(joiningDate) }),
        ...(campusId !== undefined && { campusId }),
        ...(batchId !== undefined && { batchId: batchId || null }),
        ...(houseId !== undefined && { houseId: houseId || null }),
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Teacher',
        entityId: id,
        changes: parsed.data,
      },
    })

    return teacher
  })

  return successResponse(updated, 'Teacher updated successfully')
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'teachers', 'delete')) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.teacher.findUnique({ where: { id }, select: { id: true, campusId: true, userId: true } })
  if (!existing) return errors.notFound('Teacher')

  if (session.user.role === 'ADMIN' && existing.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacher.update({
      where: { id },
      data: { isActive: false },
    })

    if (existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isActive: false },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Teacher',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Teacher deactivated successfully')
}
