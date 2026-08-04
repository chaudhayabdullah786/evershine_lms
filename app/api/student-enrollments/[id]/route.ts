/**
 * DELETE /api/student-enrollments/[id] — withdraw a student from a class section
 * PATCH  /api/student-enrollments/[id] — update roll number or delivery mode
 *
 * WHY soft-delete via status='WITHDRAWN':
 * Academic records (attendance, assessments, marks) already recorded against
 * this enrollment must remain for audit and historical reporting. Hard deletion
 * would cascade-destroy those records. Status='WITHDRAWN' preserves history
 * while removing the student from active timetable/attendance queries.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { deliveryModeSchema } from '@/lib/validation/academic'
import { z } from 'zod'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

const updateEnrollmentSchema = z.object({
  rollNumber:   z.string().min(1).max(20).optional(),
  deliveryMode: deliveryModeSchema.optional(),
})

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'students', 'read')
  if (denied) return denied

  const { id } = await params

  const enrollment = await prisma.studentEnrollment.findUnique({
    where:   { id },
    include: {
      academicYear: true,
      classSection: { include: { campus: true, batch: true, shift: true } },
      student:      { select: { id: true, firstName: true, lastName: true, registrationNumber: true } },
      subjectEnrollments: {
        include: { subjectOffering: { include: { subject: true } } },
      },
    },
  })

  if (!enrollment) return errors.notFound('Student enrollment')

  return successResponse(enrollment)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'students', 'update')
  if (denied) return denied

  const { id } = await params

  const existing = await prisma.studentEnrollment.findUnique({
    where:   { id },
    include: { academicYear: true },
  })
  if (!existing) return errors.notFound('Student enrollment')

  // Guard: Cannot edit enrollment in a locked academic year
  if (existing.academicYear.isLocked) {
    return errors.forbidden('Cannot modify enrollment in a locked academic year.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateEnrollmentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  // Guard: If changing roll number, check uniqueness within the section+year
  if (parsed.data.rollNumber) {
    const collision = await prisma.studentEnrollment.findFirst({
      where: {
        academicYearId: existing.academicYearId,
        classSectionId: existing.classSectionId,
        rollNumber:     parsed.data.rollNumber,
        id:             { not: id },
      },
      select: { id: true },
    })
    if (collision) {
      return errors.conflict('This roll number is already assigned to another student in this section.')
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.studentEnrollment.update({
      where: { id },
      data:  parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId:     session.user.id,
        action:     'UPDATE',
        entityType: 'StudentEnrollment',
        entityId:   id,
        changes:    parsed.data,
      },
    })

    return enrollment
  })

  return successResponse(updated, 'Enrollment updated successfully')
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'students', 'delete')
  if (denied) return denied

  const { id } = await params

  const existing = await prisma.studentEnrollment.findUnique({
    where:   { id },
    include: {
      academicYear: true,
      student:      { select: { id: true, firstName: true, lastName: true } },
      classSection: { select: { className: true, sectionName: true } },
    },
  })
  if (!existing) return errors.notFound('Student enrollment')

  // Guard: Cannot remove enrollment from a locked year
  if (existing.academicYear.isLocked) {
    return errors.forbidden('Cannot remove enrollment from a locked academic year.')
  }

  // Guard: Cannot remove an already-withdrawn enrollment
  if (existing.status === 'WITHDRAWN') {
    return errors.conflict('This enrollment is already withdrawn.')
  }

  await prisma.$transaction(async (tx) => {
    // Soft-delete: mark enrollment as WITHDRAWN
    await tx.studentEnrollment.update({
      where: { id },
      data:  { status: 'WITHDRAWN' },
    })

    // Cascade: reject all pending subject enrollments under this enrollment
    // WHY: APPROVED subject enrollments are kept for historical marks integrity.
    // Only PENDING ones are rejected since they haven't been graded yet.
    await tx.subjectEnrollment.updateMany({
      where: { studentEnrollmentId: id, status: 'PENDING' },
      data:  { status: 'REJECTED' },
    })

    await tx.auditLog.create({
      data: {
        userId:     session.user.id,
        action:     'DELETE',
        entityType: 'StudentEnrollment',
        entityId:   id,
        changes:    {
          studentId:     existing.studentId,
          studentName:   `${existing.student.firstName} ${existing.student.lastName}`,
          section:       `${existing.classSection.className}-${existing.classSection.sectionName}`,
          academicYear:  existing.academicYear.name,
          previousStatus: existing.status,
          newStatus:     'WITHDRAWN',
        },
      },
    })
  })

  return successResponse(
    { id, studentId: existing.studentId },
    `Enrollment withdrawn for ${existing.student.firstName} ${existing.student.lastName}`
  )
}
