import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createSubjectOfferingSchema } from '@/lib/validation/academic'
import { assertAcademicYearEditable } from '@/lib/academic/engine'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'subject_offerings', 'read')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const academicYearId = searchParams.get('academicYearId')
  const classSectionId = searchParams.get('classSectionId')

  const offerings = await prisma.subjectOffering.findMany({
    where: {
      ...(academicYearId && { academicYearId }),
      ...(classSectionId && { classSectionId }),
    },
    include: {
      subject: true,
      teacher: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      classSection: { select: { className: true, sectionName: true } },
      electiveGroup: true,
    },
  })

  return successResponse(offerings)
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'subject_offerings', 'create')
  if (denied) return denied

  const parsed = createSubjectOfferingSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    await assertAcademicYearEditable(parsed.data.academicYearId)
  } catch {
    return errors.forbidden('Academic year is locked')
  }

  const offering = await prisma.$transaction(async (tx) => {
    const created = await tx.subjectOffering.create({ data: parsed.data })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'SubjectOffering',
        entityId: created.id,
        changes: parsed.data,
      },
    })

    // [FACT] If a mandatory subject is added after students are already enrolled in the section,
    // they miss the initial auto-enrollment hook. We must backfill their subject enrollments.
    if (parsed.data.isMandatory) {
      const activeEnrollments = await tx.studentEnrollment.findMany({
        where: {
          classSectionId: parsed.data.classSectionId,
          academicYearId: parsed.data.academicYearId,
          status: 'ACTIVE'
        },
        select: { id: true }
      })

      if (activeEnrollments.length > 0) {
        await tx.subjectEnrollment.createMany({
          data: activeEnrollments.map(enr => ({
            studentEnrollmentId: enr.id,
            subjectOfferingId: created.id,
            status: 'APPROVED',
            approvedById: session.user.id
          })),
          skipDuplicates: true
        })
      }
    }

    return created
  })

  return createdResponse(offering)
}
