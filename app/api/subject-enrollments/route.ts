import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import {
  subjectEnrollmentRequestSchema,
  approveSubjectEnrollmentSchema,
} from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

/** GET — list subject enrollments (filter by studentEnrollmentId or status) */
export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'subject_enrollments', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const studentEnrollmentId = searchParams.get('studentEnrollmentId')
  const status = searchParams.get('status')

  const rows = await prisma.subjectEnrollment.findMany({
    where: {
      ...(studentEnrollmentId && { studentEnrollmentId }),
      ...(status && { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' }),
    },
    include: {
      subjectOffering: { include: { subject: true, teacher: { select: { firstName: true, lastName: true } } } },
      studentEnrollment: {
        include: { student: { select: { firstName: true, lastName: true, rollNumber: true } } },
      },
    },
  })

  return successResponse(rows)
}

/** POST — student requests elective enrollments */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'subject_enrollments', 'create')
  if (denied) return denied

  const parsed = subjectEnrollmentRequestSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { id: parsed.data.studentEnrollmentId },
    include: { classSection: true, student: true },
  })
  if (!enrollment) return errors.notFound('Student enrollment')

  if (session.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: session.user.id } })
    if (!student || student.id !== enrollment.studentId) return errors.forbidden()
  }

  if (enrollment.classSection.curriculumMode !== 'ELECTIVE') {
    return errors.forbidden('This class uses fixed curriculum; electives are not selectable')
  }

  const offerings = await prisma.subjectOffering.findMany({
    where: { id: { in: parsed.data.subjectOfferingIds }, classSectionId: enrollment.classSectionId },
  })
  if (offerings.length !== parsed.data.subjectOfferingIds.length) {
    return errors.validation({ errors: [{ path: ['subjectOfferingIds'], message: 'Invalid subject selection' }] } as never)
  }

  const electiveOnly = offerings.filter((o) => !o.isMandatory)
  if (electiveOnly.length === 0) {
    return errors.validation({ errors: [{ path: ['subjectOfferingIds'], message: 'Select elective subjects only' }] } as never)
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = []
    for (const offeringId of parsed.data.subjectOfferingIds) {
      const row = await tx.subjectEnrollment.upsert({
        where: {
          studentEnrollmentId_subjectOfferingId: {
            studentEnrollmentId: parsed.data.studentEnrollmentId,
            subjectOfferingId: offeringId,
          },
        },
        create: {
          studentEnrollmentId: parsed.data.studentEnrollmentId,
          subjectOfferingId: offeringId,
          status: 'PENDING',
        },
        update: { status: 'PENDING' },
      })
      rows.push(row)
    }
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'SubjectEnrollment',
        entityId: parsed.data.studentEnrollmentId,
        changes: { subjectOfferingIds: parsed.data.subjectOfferingIds },
      },
    })
    return rows
  })

  return createdResponse(created, 'Elective enrollment request submitted')
}

/** PATCH — admin approves or rejects pending enrollments */
export async function PATCH(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'subject_enrollments', 'update')
  if (denied) return denied

  const parsed = approveSubjectEnrollmentSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const status = parsed.data.approve ? 'APPROVED' : 'REJECTED'

  const updated = await prisma.$transaction(async (tx) => {
    const rows = await tx.subjectEnrollment.updateMany({
      where: { id: { in: parsed.data.enrollmentIds }, status: 'PENDING' },
      data: { status, approvedById: session.user.id },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'SubjectEnrollment',
        entityId: parsed.data.enrollmentIds.join(','),
        changes: { status, count: rows.count },
      },
    })
    return rows
  })

  return successResponse(updated)
}
