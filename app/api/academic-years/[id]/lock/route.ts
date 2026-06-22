import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import type { Role } from '@prisma/client'

/**
 * Lock academic year — freezes results, attendance, timetable, and grading edits.
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
  if (year.isLocked) return errors.conflict('Year is already locked')

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.academicYear.update({
      where: { id },
      data: { isLocked: true, isActive: false },
    })

    await tx.timetableSlot.updateMany({
      where: { academicYearId: id, isPublished: false },
      data: { isPublished: true },
    })

    await tx.academicGradingScheme.updateMany({
      where: { academicYearId: id, isPublished: false },
      data: { isPublished: true },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'LOCK',
        entityType: 'AcademicYear',
        entityId: id,
        changes: { isLocked: true, message: 'Year-end lock applied' },
      },
    })

    return row
  })

  return successResponse(updated, 'Academic year locked. Historical records are now immutable.')
}
