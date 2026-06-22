import { prisma } from '@/lib/prisma'
import type { ClassDeliveryMode, CurriculumMode } from '@prisma/client'

/** Auto-enroll mandatory subjects for fixed-curriculum sections */
export async function autoEnrollMandatorySubjects(
  studentEnrollmentId: string,
  classSectionId: string,
  academicYearId: string
): Promise<number> {
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      classSectionId,
      academicYearId,
      isMandatory: true,
    },
  })

  let created = 0
  for (const offering of offerings) {
    await prisma.subjectEnrollment.upsert({
      where: {
        studentEnrollmentId_subjectOfferingId: {
          studentEnrollmentId,
          subjectOfferingId: offering.id,
        },
      },
      create: {
        studentEnrollmentId,
        subjectOfferingId: offering.id,
        status: 'APPROVED',
      },
      update: { status: 'APPROVED' },
    })
    created++
  }
  return created
}

export async function createYearEnrollmentForStudent(params: {
  studentId: string
  academicYearId: string
  classSectionId: string
  rollNumber: string
  deliveryMode?: ClassDeliveryMode
  promotedFromId?: string
}): Promise<{ enrollmentId: string; subjectsEnrolled: number }> {
  const section = await prisma.classSection.findUnique({
    where: { id: params.classSectionId },
    select: { curriculumMode: true },
  })
  if (!section) throw new Error('CLASS_SECTION_NOT_FOUND')

  const enrollment = await prisma.studentEnrollment.create({
    data: {
      studentId: params.studentId,
      academicYearId: params.academicYearId,
      classSectionId: params.classSectionId,
      rollNumber: params.rollNumber,
      deliveryMode: params.deliveryMode ?? 'PHYSICAL',
      promotedFromId: params.promotedFromId,
      status: 'ACTIVE',
    },
  })

  let subjectsEnrolled = 0
  if (section.curriculumMode === 'FIXED') {
    subjectsEnrolled = await autoEnrollMandatorySubjects(
      enrollment.id,
      params.classSectionId,
      params.academicYearId
    )
  }

  return { enrollmentId: enrollment.id, subjectsEnrolled }
}

export function batchUsesElectives(mode: CurriculumMode): boolean {
  return mode === 'ELECTIVE'
}
