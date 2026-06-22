/**
 * GET  /api/campuses  — list campuses
 * POST /api/campuses  — create campus (Super Admin only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import { createCampusSchema } from '@/lib/validation/batch'
import type { Role } from '@prisma/client'

export async function GET(_request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'campuses', 'read')) return errors.forbidden()

  // Scoping: If user is not SUPER_ADMIN, they can only view their own campus
  const scopedCampusId =
    session.user.role !== 'SUPER_ADMIN' ? (session.user.campusId ?? undefined) : undefined

  const where = {
    ...(scopedCampusId && { id: scopedCampusId }),
    isActive: true,
  }

  const campuses = await prisma.campus.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { students: true, teachers: true, batches: true },
      },
    },
  })

  return successResponse(campuses)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'campuses', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createCampusSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  const existingCode = await prisma.campus.findUnique({ where: { code: data.code }, select: { id: true } })
  if (existingCode) return errors.conflict('A campus with this code already exists')

  const campus = await prisma.$transaction(async (tx) => {
    const newCampus = await tx.campus.create({ data })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Campus',
        entityId: newCampus.id,
        changes: data,
      },
    })

    return newCampus
  })

  return createdResponse(campus, 'Campus created successfully')
}
