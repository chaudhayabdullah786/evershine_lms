import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { ensureSingleActiveAcademicYear } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  isLocked: z.boolean().optional(),
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

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.academicYear.update({ where: { id }, data: parsed.data })
    if (row.isActive) await ensureSingleActiveAcademicYear(row.id)
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'AcademicYear',
        entityId: id,
        changes: { before: existing, after: row },
      },
    })
    return row
  })

  return successResponse(updated)
}
