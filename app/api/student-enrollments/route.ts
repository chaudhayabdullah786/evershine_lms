import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createStudentEnrollmentSchema } from '@/lib/validation/academic'
import { createYearEnrollmentForStudent } from '@/lib/academic/enrollment'
import { assertAcademicYearEditable } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'students', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('studentId')
  const academicYearId = searchParams.get('academicYearId')
  const classSectionId = searchParams.get('classSectionId')
  const status = searchParams.get('status') ?? 'ACTIVE'

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      ...(studentId && { studentId }),
      ...(academicYearId && { academicYearId }),
      ...(classSectionId && { classSectionId }),
      ...(status && { status: status as 'ACTIVE' | 'GRADUATED' | 'RETAINED' | 'TRANSFERRED' }),
    },
    include: {
      academicYear: true,
      classSection: { include: { campus: true, batch: true, shift: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          registrationNumber: true,
          rollNumber: true,
          houseId: true,
          house: { select: { id: true, name: true, color: true } },
        },
      },
      subjectEnrollments: { include: { subjectOffering: { include: { subject: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return successResponse(enrollments)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'students', 'create')
  if (denied) return denied

  const parsed = createStudentEnrollmentSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const enrollmentPayload = {
    studentId: parsed.data.studentId!,
    academicYearId: parsed.data.academicYearId!,
    classSectionId: parsed.data.classSectionId!,
    rollNumber: parsed.data.rollNumber!,
    deliveryMode: parsed.data.deliveryMode,
    promotedFromId: parsed.data.promotedFromId,
  }

  try {
    await assertAcademicYearEditable(enrollmentPayload.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  const duplicate = await prisma.studentEnrollment.findUnique({
    where: {
      studentId_academicYearId_classSectionId: {
        studentId: enrollmentPayload.studentId,
        academicYearId: enrollmentPayload.academicYearId,
        classSectionId: enrollmentPayload.classSectionId,
      },
    },
  })
  if (duplicate) {
    return errors.conflict('Student is already enrolled in this class section for this year')
  }

  const result = await createYearEnrollmentForStudent(enrollmentPayload)

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'StudentEnrollment',
      entityId: result.enrollmentId,
      changes: enrollmentPayload,
    },
  })

  return createdResponse(result)
}
