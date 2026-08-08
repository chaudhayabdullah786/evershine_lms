import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { ensureSingleActiveAcademicYear } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'
import { z } from 'zod'

// WHY separate schemas: toggle operations (activate/lock) and data edits
// are conceptually different mutations. Keeping them unified but validating
// constraints at runtime is simpler than splitting into two route paths.
const patchSchema = z.object({
  isActive:  z.boolean().optional(),
  isLocked:  z.boolean().optional(),
  // Date/name edits — only allowed on unlocked years
  name:      z.string().min(4).max(20).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD date format')
    .optional(),
  endDate:   z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD date format')
    .optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'update')
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.academicYear.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Academic year')

  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
  if (existing.isLocked && !isSuperAdmin) {
    return errors.forbidden('Locked academic years cannot be modified')
  }

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  // Guard: Prevent startDate changes on active year unless SuperAdmin
  if (parsed.data.startDate && existing.isActive && !isSuperAdmin) {
    return errors.forbidden(
      'Cannot change the start date of the currently active academic year. Extend the end date instead.'
    )
  }

  // Guard: Unique year name
  if (parsed.data.name && parsed.data.name !== existing.name) {
    const nameCollision = await prisma.academicYear.findFirst({
      where: { name: parsed.data.name, id: { not: id } },
      select: { id: true },
    })
    if (nameCollision) {
      return errors.conflict('An academic year with this name already exists.')
    }
  }

  const dataToUpdate: Record<string, unknown> = { ...parsed.data }
  if (dataToUpdate.startDate) dataToUpdate.startDate = new Date(parsed.data.startDate as string)
  if (dataToUpdate.endDate)   dataToUpdate.endDate   = new Date(parsed.data.endDate as string)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.academicYear.update({
      where: { id },
      data: dataToUpdate as Parameters<typeof tx.academicYear.update>[0]['data'],
    })
    if (row.isActive) {
      await ensureSingleActiveAcademicYear(row.id, tx)
    }
    await tx.auditLog.create({
      data: {
        userId:     session.user.id,
        action:     'UPDATE',
        entityType: 'AcademicYear',
        entityId:   id,
        changes:    { before: existing, after: row },
      },
    })
    return row
  })

  return successResponse(updated, 'Academic year updated successfully')
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'delete')
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.academicYear.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Academic year')

  if (existing.isActive) {
    return errors.forbidden('Cannot delete the active academic year. Activate another academic year first.')
  }

  await prisma.academicYear.delete({ where: { id } })
  return successResponse(null, 'Academic year deleted successfully')
}
