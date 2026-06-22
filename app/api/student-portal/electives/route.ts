import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { subjectEnrollmentRequestSchema } from '@/lib/validation/academic'
import { getActiveAcademicYear } from '@/lib/academic/engine'

/** Student submits elective subject choices for admin approval. */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const parsed = subjectEnrollmentRequestSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const student = await prisma.student.findUnique({ where: { userId: session.user.id } })
  if (!student) return errors.notFound('Student')

  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return errors.forbidden('No active academic year')
  if (activeYear.isLocked) return errors.forbidden('Academic year is locked')

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: {
      id: parsed.data.studentEnrollmentId,
      studentId: student.id,
      academicYearId: activeYear.id,
      status: 'ACTIVE',
    },
    include: { classSection: true },
  })
  if (!enrollment) {
    return errors.forbidden('You are not enrolled for the current academic year yet')
  }
  if (enrollment.studentId !== student.id || enrollment.id !== parsed.data.studentEnrollmentId) {
    return errors.forbidden()
  }
  if (enrollment.classSection.curriculumMode !== 'ELECTIVE') {
    return errors.forbidden('Your program uses a fixed curriculum; electives are assigned by admin')
  }

  const offerings = await prisma.subjectOffering.findMany({
    where: {
      id: { in: parsed.data.subjectOfferingIds },
      classSectionId: enrollment.classSectionId,
      academicYearId: activeYear.id,
      isMandatory: false,
    },
    include: { electiveGroup: true },
  })

  if (offerings.length !== parsed.data.subjectOfferingIds.length) {
    return errors.validation({
      errors: [{ path: ['subjectOfferingIds'], message: 'One or more subjects are not valid electives' }],
    } as never)
  }

  // Elective group constraints
  const byGroup = new Map<string, typeof offerings>()
  for (const o of offerings) {
    const key = o.electiveGroupId ?? `solo-${o.id}`
    const list = byGroup.get(key) ?? []
    list.push(o)
    byGroup.set(key, list)
  }
  for (const [groupId, list] of byGroup) {
    if (groupId.startsWith('solo-')) continue
    const group = list[0].electiveGroup
    if (group && list.length > group.maxSelections) {
      return errors.validation({
        errors: [
          {
            path: ['subjectOfferingIds'],
            message: `${group.name}: select at most ${group.maxSelections} subject(s)`,
          },
        ],
      } as never)
    }
  }

  const rows = await prisma.$transaction(async (tx) => {
    const created = []
    for (const offeringId of parsed.data.subjectOfferingIds) {
      const row = await tx.subjectEnrollment.upsert({
        where: {
          studentEnrollmentId_subjectOfferingId: {
            studentEnrollmentId: enrollment.id,
            subjectOfferingId: offeringId,
          },
        },
        create: {
          studentEnrollmentId: enrollment.id,
          subjectOfferingId: offeringId,
          status: 'PENDING',
        },
        update: { status: 'PENDING' },
      })
      created.push(row)
    }
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'SubjectEnrollment',
        entityId: enrollment.id,
        changes: { subjectOfferingIds: parsed.data.subjectOfferingIds },
      },
    })
    return created
  })

  return createdResponse(rows, 'Elective choices submitted for admin approval')
}
