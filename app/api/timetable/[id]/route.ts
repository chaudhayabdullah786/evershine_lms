import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { updateTimetableSchema } from '@/lib/validation/timetable'
import type { Role } from '@prisma/client'
import { guardLegacyClassMutation } from '@/lib/academic/legacy-guard'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  const legacyBlocked = guardLegacyClassMutation(request, 'timetable', role)
  if (legacyBlocked) return legacyBlocked
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'
  if (!isAdmin) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.timetable.findUnique({
    where: { id },
    include: {
      class: { select: { campusId: true } },
    },
  })

  if (!existing) return errors.notFound('Timetable slot')

  // Scoping check for campus admin
  if (role === 'ADMIN' && session.user.campusId && existing.class.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateTimetableSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  // If changing class or teacher, verify that they are also in the admin's campus
  if (role === 'ADMIN' && session.user.campusId) {
    if (data.classId) {
      const cls = await prisma.class.findUnique({ where: { id: data.classId }, select: { campusId: true } })
      if (cls?.campusId !== session.user.campusId) {
        return errors.forbidden('Cannot move slot to a class in another campus')
      }
    }
    if (data.teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: data.teacherId }, select: { campusId: true } })
      if (teacher?.campusId !== session.user.campusId) {
        return errors.forbidden('Cannot assign teacher from another campus')
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.timetable.update({
      where: { id },
      data,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Timetable',
        entityId: id,
        changes: data,
      },
    })

    return res
  })

  return successResponse(updated, 'Timetable slot updated successfully')
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  const legacyBlocked = guardLegacyClassMutation(request, 'timetable', role)
  if (legacyBlocked) return legacyBlocked
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'
  if (!isAdmin) return errors.forbidden()

  const { id } = await params

  const existing = await prisma.timetable.findUnique({
    where: { id },
    include: {
      class: { select: { campusId: true } },
    },
  })

  if (!existing) return errors.notFound('Timetable slot')

  // Scoping check for campus admin
  if (role === 'ADMIN' && session.user.campusId && existing.class.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  await prisma.$transaction(async (tx) => {
    await tx.timetable.update({
      where: { id },
      data: { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Timetable',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Timetable slot deleted successfully')
}
