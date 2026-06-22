import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission, campusScope } from '@/lib/academic/api-helpers'
import { createRoomSchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'class_sections', 'read')
  if (denied) return denied

  const campusId = new URL(request.url).searchParams.get('campusId')
  const scopedCampus = campusScope(
    session.user.role as Role,
    session.user.campusId,
    campusId
  )

  const rooms = await prisma.room.findMany({
    where: {
      isActive: true,
      ...(scopedCampus && { campusId: scopedCampus }),
    },
    include: { campus: { select: { name: true, code: true } } },
    orderBy: [{ campusId: 'asc' }, { name: 'asc' }],
  })

  return successResponse(rooms)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'class_sections', 'create')
  if (denied) return denied

  const parsed = createRoomSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  if (
    session.user.role !== 'SUPER_ADMIN' &&
    parsed.data.campusId !== session.user.campusId
  ) {
    return errors.forbidden()
  }

  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.room.create({
      data: {
        campusId: parsed.data.campusId,
        name: parsed.data.name,
        capacity: parsed.data.capacity,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Room',
        entityId: created.id,
        changes: parsed.data,
      },
    })
    return created
  })

  return createdResponse(room)
}
