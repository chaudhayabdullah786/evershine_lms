import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { addStudentEnrollmentSchema } from '@/lib/validation/student'
import { getActiveAcademicYear, assertAcademicYearEditable } from '@/lib/academic/engine'
import { createYearEnrollmentForStudent } from '@/lib/academic/enrollment'
import { enrollmentInclude } from '@/lib/students/enrollment-sync'
import type { Role } from '@prisma/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'read')) return errors.forbidden()

  const { id } = await params
  const student = await prisma.student.findUnique({ where: { id }, select: { id: true } })
  if (!student) return errors.notFound('Student')

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: id },
    include: enrollmentInclude,
    orderBy: [{ academicYear: { startDate: 'desc' } }, { createdAt: 'desc' }],
  })

  return successResponse(enrollments)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'create')) return errors.forbidden()

  const { id: studentId } = await params
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, campusId: true },
  })
  if (!student) return errors.notFound('Student')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = addStudentEnrollmentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const activeYear = parsed.data.academicYearId
    ? await prisma.academicYear.findUnique({ where: { id: parsed.data.academicYearId } })
    : await getActiveAcademicYear()

  if (!activeYear) return errors.validation({ errors: [{ path: ['academicYearId'], message: 'No active academic year' }] } as never)

  try {
    await assertAcademicYearEditable(activeYear.id)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  const section = await prisma.classSection.findUnique({
    where: { id: parsed.data.classSectionId },
    select: { campusId: true },
  })
  if (!section) return errors.notFound('Class section')
  if (section.campusId !== student.campusId) {
    return errors.validation({
      errors: [{ path: ['classSectionId'], message: 'Section must belong to the student campus' }],
    } as never)
  }

  const duplicate = await prisma.studentEnrollment.findUnique({
    where: {
      studentId_academicYearId_classSectionId: {
        studentId,
        academicYearId: activeYear.id,
        classSectionId: parsed.data.classSectionId,
      },
    },
  })
  if (duplicate) return errors.conflict('Student is already enrolled in this section for this year')

  const result = await createYearEnrollmentForStudent({
    studentId,
    academicYearId: activeYear.id,
    classSectionId: parsed.data.classSectionId,
    rollNumber: parsed.data.rollNumber,
    deliveryMode: parsed.data.deliveryMode,
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'StudentEnrollment',
      entityId: result.enrollmentId,
      changes: { studentId, ...parsed.data, academicYearId: activeYear.id },
    },
  })

  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { id: result.enrollmentId },
    include: enrollmentInclude,
  })

  return createdResponse(enrollment, 'Enrollment created successfully')
}
