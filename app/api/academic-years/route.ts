import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createAcademicYearSchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

export async function GET() {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'read')
  if (denied) return denied

  const years = await prisma.academicYear.findMany({ orderBy: { startDate: 'desc' } })
  return successResponse(years)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'create')
  if (denied) return denied

  const body = await request.json()
  const parsed = createAcademicYearSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { name, startDate, endDate, isActive } = parsed.data
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end <= start) return errors.validation({ errors: [{ path: ['endDate'], message: 'End date must be after start date' }] } as never)

  const year = await prisma.$transaction(async (tx) => {
    const created = await tx.academicYear.create({
      data: {
        name,
        startDate: start,
        endDate: end,
        isActive: isActive ?? false,
      },
    })
    if (created.isActive) {
      await tx.academicYear.updateMany({
        where: { isActive: true, NOT: { id: created.id } },
        data: { isActive: false },
      })
    }
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'AcademicYear',
        entityId: created.id,
        changes: { name, startDate, endDate, isActive: created.isActive },
      },
    })
    return created
  })

  return createdResponse(year, 'Academic year created')
}
