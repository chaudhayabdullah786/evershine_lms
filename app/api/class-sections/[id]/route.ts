import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { deliveryModeSchema, curriculumModeSchema } from '@/lib/validation/academic'
import { z } from 'zod'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

// WHY: Separate patch schema from create — only mutable fields allowed here.
// campusId/batchId/shiftId are structural and cannot change post-creation
// without cascading data integrity issues.
const updateClassSectionSchema = z.object({
  className:      z.string().min(1).max(50).optional(),
  sectionName:    z.string().min(1).max(10).optional(),
  grade:          z.number().int().min(1).max(12).optional().nullable(),
  capacity:       z.number().int().min(1).max(200).optional(),
  deliveryMode:   deliveryModeSchema.optional(),
  curriculumMode: curriculumModeSchema.optional(),
  isActive:       z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  const denied = requirePermission(session.user.role as Role, 'class_sections', 'update')
  if (denied) return denied

  const { id } = await params

  const existing = await prisma.classSection.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Class section')

  // ADMIN cannot edit sections belonging to another campus
  if (
    session.user.role !== 'SUPER_ADMIN' &&
    session.user.campusId &&
    existing.campusId !== session.user.campusId
  ) {
    return errors.forbidden('You can only edit sections from your campus.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateClassSectionSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  // Guard: If renaming, check for uniqueness collision against existing sections
  if (parsed.data.className || parsed.data.sectionName) {
    const newClassName = parsed.data.className ?? existing.className
    const newSectionName = parsed.data.sectionName ?? existing.sectionName

    const collision = await prisma.classSection.findFirst({
      where: {
        campusId:    existing.campusId,
        batchId:     existing.batchId,
        shiftId:     existing.shiftId,
        className:   newClassName,
        sectionName: newSectionName,
        id:          { not: id },
      },
      select: { id: true },
    })

    if (collision) {
      return errors.conflict(
        'A class section with this class name and section name already exists for this campus/batch/shift.'
      )
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const section = await tx.classSection.update({
      where: { id },
      data:  parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId:     session.user.id,
        action:     'UPDATE',
        entityType: 'ClassSection',
        entityId:   id,
        changes:    { before: existing, after: parsed.data },
      },
    })

    return section
  })

  return successResponse(updated, 'Class section updated successfully')
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!

  const denied = requirePermission(session.user.role as Role, 'class_sections', 'delete')
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.classSection.findUnique({
    where:   { id },
    include: { _count: { select: { enrollments: true } } },
  })
  if (!existing) return errors.notFound('Class section')

  if (
    session.user.role !== 'SUPER_ADMIN' &&
    session.user.campusId &&
    existing.campusId !== session.user.campusId
  ) {
    return errors.forbidden('You can only delete sections from your campus.')
  }

  // TRADEOFF: Block deletion if active enrollments exist.
  // WHY: Orphaned enrollment records pointing to an inactive section corrupt
  // timetable, grade, and attendance lookups without surfacing a clear error.
  // The superadmin must first withdraw all enrolled students.
  const activeEnrollmentCount = await prisma.studentEnrollment.count({
    where: { classSectionId: id, status: 'ACTIVE' },
  })

  if (activeEnrollmentCount > 0) {
    return errors.conflict(
      `Cannot delete: ${activeEnrollmentCount} active enrollment(s) exist in this section. Remove all enrollments first.`
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.classSection.update({
      where: { id },
      data:  { isActive: false },
    })

    await tx.auditLog.create({
      data: {
        userId:     session.user.id,
        action:     'DELETE',
        entityType: 'ClassSection',
        entityId:   id,
        changes:    { status: 'deactivated', campusId: existing.campusId },
      },
    })
  })

  return successResponse({ id }, 'Class section deleted successfully')
}
