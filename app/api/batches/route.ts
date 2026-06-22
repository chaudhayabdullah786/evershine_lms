/**
 * GET  /api/batches  — list batches
 * POST /api/batches  — create batch
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import { createBatchSchema } from '@/lib/validation/batch'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'batches', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const campusId = searchParams.get('campusId')

  const scopedCampusId =
    session.user.role !== 'SUPER_ADMIN' ? (session.user.campusId ?? undefined) : (campusId ?? undefined)

  const where = {
    ...(scopedCampusId && { campusId: scopedCampusId }),
    isActive: true,
  }

  const batches = await prisma.batch.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      campus: { select: { name: true, code: true } },
      _count: {
        select: { classes: true, students: true, houses: true },
      },
    },
  })

  return successResponse(batches)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'batches', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createBatchSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = {
    ...parsed.data,
    forceGenderSeparation:
      parsed.data.forceGenderSeparation ??
      ['Secondary', 'HigherSecondary'].includes(parsed.data.academicLevel),
  }

  if (session.user.role !== 'SUPER_ADMIN' && data.campusId !== session.user.campusId) {
    return errors.forbidden()
  }

  const existing = await prisma.batch.findUnique({
    where: { name_campusId: { name: data.name, campusId: data.campusId } },
    select: { id: true }
  })
  if (existing) return errors.conflict('A batch with this name already exists in this campus')

  const batch = await prisma.$transaction(async (tx) => {
    const newBatch = await tx.batch.create({ data })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Batch',
        entityId: newBatch.id,
        changes: data,
      },
    })

    return newBatch
  })

  return createdResponse(batch, 'Batch created successfully')
}