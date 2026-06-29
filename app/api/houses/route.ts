/**
 * GET  /api/houses  — list houses
 * POST /api/houses  — create house
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import { createHouseSchema } from '@/lib/validation/batch'
import type { Prisma, Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'houses', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const batchId = searchParams.get('batchId')
  const campusId = searchParams.get('campusId')

  const scopedCampusId =
    session.user.role !== 'SUPER_ADMIN' ? (session.user.campusId ?? undefined) : (campusId ?? undefined)

  const where = {
    ...(batchId && { batchId }),
    ...(scopedCampusId && { batch: { campusId: scopedCampusId } }),
    isActive: true,
  }

  const houses = await prisma.house.findMany({
    where,
    orderBy: { points: 'desc' },
    include: {
      batch: { select: { name: true, campus: { select: { name: true } } } },
      captain: { select: { firstName: true, lastName: true } },
      _count: { select: { students: true } },
    },
  })

  return successResponse(houses)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'houses', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createHouseSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data: Prisma.HouseUncheckedCreateInput = {
    name: parsed.data.name!,
    color: parsed.data.color!,
    batchId: parsed.data.batchId!,
    motto: parsed.data.motto,
    captainId: parsed.data.captainId,
    viceCaptainId: parsed.data.viceCaptainId,
  }

  const batch = await prisma.batch.findUnique({ where: { id: data.batchId }, select: { campusId: true, academicLevel: true } })
  if (!batch) return errors.notFound('Batch')

  if (batch.academicLevel === 'PreSchool' || batch.academicLevel === 'Elementary') {
    return errors.forbidden('Performance Houses can only be created for Class 6 and onwards (Secondary level or above)')
  }

  if (session.user.role !== 'SUPER_ADMIN' && batch.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const existing = await prisma.house.findUnique({
    where: { name_batchId: { name: data.name, batchId: data.batchId } },
    select: { id: true }
  })
  if (existing) return errors.conflict('This house already exists in this batch')

  const house = await prisma.$transaction(async (tx) => {
    const newHouse = await tx.house.create({ data })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'House',
        entityId: newHouse.id,
        changes: {
          name: data.name,
          color: data.color,
          batchId: data.batchId,
          motto: data.motto ?? null,
          captainId: data.captainId ?? null,
          viceCaptainId: data.viceCaptainId ?? null,
        },
      },
    })

    return newHouse
  })

  return createdResponse(house, 'House created successfully')
}