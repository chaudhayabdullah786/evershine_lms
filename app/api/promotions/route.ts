import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { promotionBatchSchema } from '@/lib/validation/academic'
import { autoEnrollMandatorySubjects } from '@/lib/academic/enrollment'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'promotions', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const classSectionId = searchParams.get('classSectionId')
  const academicYearId = searchParams.get('academicYearId')

  if (classSectionId && academicYearId) {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId,
        academicYearId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            registrationNumber: true,
          },
        },
      },
      orderBy: { rollNumber: 'asc' },
    })
    return successResponse(enrollments)
  }

  const records = await prisma.promotionRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      student: { select: { firstName: true, lastName: true, registrationNumber: true } },
      fromEnrollment: { include: { classSection: true, academicYear: true } },
      toEnrollment: { include: { classSection: true, academicYear: true } },
    },
  })
  return successResponse(records)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'promotions', 'create')
  if (denied) return denied

  const parsed = promotionBatchSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const fromYear = await prisma.academicYear.findUnique({
    where: { id: parsed.data.fromAcademicYearId },
  })
  if (!fromYear) return errors.notFound('From academic year')

  const targetYearId =
    parsed.data.toAcademicYearId ??
    (parsed.data.status === 'PROMOTED' || parsed.data.status === 'RETAINED'
      ? null
      : parsed.data.fromAcademicYearId)

  if (
    (parsed.data.status === 'PROMOTED' || parsed.data.status === 'RETAINED') &&
    !targetYearId
  ) {
    return errors.validation({
      errors: [{ path: ['toAcademicYearId'], message: 'Target academic year is required for promotion' }],
    } as never)
  }

  if (parsed.data.status === 'PROMOTED' && !parsed.data.toClassSectionId) {
    return errors.validation({
      errors: [{ path: ['toClassSectionId'], message: 'Target class section is required' }],
    } as never)
  }

  const toYear = targetYearId
    ? await prisma.academicYear.findUnique({ where: { id: targetYearId } })
    : null
  if (targetYearId && !toYear) return errors.notFound('Target academic year')
  if (toYear?.isLocked) return errors.forbidden('Cannot enroll into a locked academic year')

  const toSectionId =
    parsed.data.status === 'RETAINED'
      ? parsed.data.fromClassSectionId
      : parsed.data.toClassSectionId

  const results = await prisma.$transaction(async (tx) => {
    const promoted = []

    for (const studentId of parsed.data.studentIds) {
      const fromEnrollment = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          academicYearId: parsed.data.fromAcademicYearId,
          classSectionId: parsed.data.fromClassSectionId,
          status: 'ACTIVE',
        },
      })
      if (!fromEnrollment) continue

      const newStatus =
        parsed.data.status === 'GRADUATED'
          ? 'GRADUATED'
          : parsed.data.status === 'RETAINED'
            ? 'RETAINED'
            : parsed.data.status === 'TRANSFERRED'
              ? 'TRANSFERRED'
              : 'PROMOTED'

      await tx.studentEnrollment.update({
        where: { id: fromEnrollment.id },
        data: { status: newStatus },
      })

      let toEnrollmentId: string | null = null

      if (
        (parsed.data.status === 'PROMOTED' || parsed.data.status === 'RETAINED') &&
        targetYearId &&
        toSectionId
      ) {
        const existing = await tx.studentEnrollment.findUnique({
          where: {
            studentId_academicYearId_classSectionId: {
              studentId,
              academicYearId: targetYearId,
              classSectionId: toSectionId,
            },
          },
        })

        if (!existing) {
          const toEnrollment = await tx.studentEnrollment.create({
            data: {
              studentId,
              academicYearId: targetYearId,
              classSectionId: toSectionId,
              rollNumber: fromEnrollment.rollNumber,
              deliveryMode: fromEnrollment.deliveryMode,
              promotedFromId: fromEnrollment.id,
              status: 'ACTIVE',
            },
          })
          await autoEnrollMandatorySubjects(
            toEnrollment.id,
            toSectionId,
            targetYearId
          )
          toEnrollmentId = toEnrollment.id

          await tx.student.update({
            where: { id: studentId },
            data: {
              academicYear: toYear?.name ?? fromYear.name,
            },
          })
        } else {
          toEnrollmentId = existing.id
        }
      }

      if (parsed.data.status === 'GRADUATED') {
        await tx.student.update({
          where: { id: studentId },
          data: { enrollmentStatus: 'GRADUATED' },
        })
      }

      const record = await tx.promotionRecord.create({
        data: {
          studentId,
          academicYearId: parsed.data.fromAcademicYearId,
          fromEnrollmentId: fromEnrollment.id,
          toEnrollmentId,
          promotionStatus: parsed.data.status,
          promotedById: session.user.id,
          remarks: parsed.data.remarks,
        },
      })
      promoted.push(record)
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'PROMOTE',
        entityType: 'Promotion',
        entityId: parsed.data.fromAcademicYearId,
        changes: parsed.data,
      },
    })

    return promoted
  })

  return createdResponse(results, 'Promotion records created')
}
