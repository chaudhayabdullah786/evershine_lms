import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import type { Role } from '@prisma/client'

/**
 * Unlock academic year — unfreezes the year.
 * Only users with update permissions on academic_years (like superadmins) can perform this.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'update')
  if (denied) return denied

  const { id } = await params
  const year = await prisma.academicYear.findUnique({ where: { id } })
  if (!year) return errors.notFound('Academic year')
  if (!year.isLocked) return errors.conflict('Year is not locked')

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.academicYear.update({
      where: { id },
      data: { isLocked: false },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UNLOCK',
        entityType: 'AcademicYear',
        entityId: id,
        changes: { isLocked: false, message: 'Year unlocked' },
      },
    })

    return row
  })

  return successResponse(updated, 'Academic year unlocked successfully.')
}
