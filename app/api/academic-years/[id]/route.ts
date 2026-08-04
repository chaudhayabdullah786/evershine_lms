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
  if (existing.isLocked) return errors.forbidden('Locked academic years cannot be modified')

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  // Guard: Prevent startDate changes on the active year.
  // WHY: Changing startDate mid-year shifts the attendance window, breaking
  // historical attendance percentage calculations for already-recorded days.
  // endDate is safe to extend (e.g. extending the year due to holidays).
  if (parsed.data.startDate && existing.isActive) {
    return errors.forbidden(
      'Cannot change the start date of the currently active academic year. Extend the end date instead.'
    )
  }

  // Guard: Unique year name
  if (parsed.data.name) {
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
    const row = await tx.academicYear.update({ where: { id }, data: dataToUpdate as Parameters<typeof tx.academicYear.update>[0]['data'] })
    if (row.isActive) await ensureSingleActiveAcademicYear(row.id)
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
