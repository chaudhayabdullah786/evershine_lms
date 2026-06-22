import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { ensureSingleActiveAcademicYear } from '@/lib/academic/engine'
import { yearRolloverSchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

/**
 * Year-end rollover: lock outgoing year and create the next academic year.
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'create')
  if (denied) return denied

  const parsed = yearRolloverSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const fromYear = await prisma.academicYear.findUnique({ where: { id: parsed.data.fromYearId } })
  if (!fromYear) return errors.notFound('Source academic year')

  const existingName = await prisma.academicYear.findUnique({
    where: { name: parsed.data.newYearName },
  })
  if (existingName) return errors.conflict('Academic year name already exists')

  const result = await prisma.$transaction(async (tx) => {
    if (!fromYear.isLocked) {
      await tx.academicYear.update({
        where: { id: fromYear.id },
        data: { isLocked: true, isActive: false },
      })
    }

    const newYear = await tx.academicYear.create({
      data: {
        name: parsed.data.newYearName,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        isActive: parsed.data.activateNewYear,
        isLocked: false,
      },
    })

    if (parsed.data.activateNewYear) {
      await ensureSingleActiveAcademicYear(newYear.id)
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ROLLOVER',
        entityType: 'AcademicYear',
        entityId: newYear.id,
        changes: {
          fromYearId: fromYear.id,
          fromYearName: fromYear.name,
          newYearId: newYear.id,
          newYearName: newYear.name,
        },
      },
    })

    return { fromYear: { ...fromYear, isLocked: true }, newYear }
  })

  return createdResponse(result, 'Academic rollover completed')
}
