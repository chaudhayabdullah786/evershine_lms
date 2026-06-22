import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { createYearEnrollmentForStudent } from '@/lib/academic/enrollment'
import type { ClassDeliveryMode, SessionShift } from '@prisma/client'

export type EnrollmentPlacementInput = {
  studentId: string
  rollNumber: string
  classSectionId?: string
  classId?: string
  section?: string
  campusId: string
  batchId: string
  shift?: SessionShift
  deliveryMode?: ClassDeliveryMode
}

/** Create StudentEnrollment for the active academic year when section is known. */
export async function ensureActiveYearEnrollment(
  input: EnrollmentPlacementInput
): Promise<{ enrollmentId: string } | null> {
  const activeYear = await getActiveAcademicYear()
  if (!activeYear || activeYear.isLocked) return null

  let resolvedSectionId = input.classSectionId
  if (!resolvedSectionId && input.classId) {
    const cls = await prisma.class.findUnique({ where: { id: input.classId } })
    const shiftCode = input.shift ?? 'MORNING'
    const shiftRow = await prisma.shift.findUnique({ where: { code: shiftCode } })
    if (cls && shiftRow) {
      const sectionRow = await prisma.classSection.findFirst({
        where: {
          campusId: input.campusId,
          batchId: input.batchId,
          shiftId: shiftRow.id,
          className: `Class ${cls.grade}`,
          sectionName: input.section ?? cls.section ?? 'A',
          isActive: true,
        },
      })
      resolvedSectionId = sectionRow?.id
    }
  }

  if (!resolvedSectionId) return null

  const existing = await prisma.studentEnrollment.findUnique({
    where: {
      studentId_academicYearId_classSectionId: {
        studentId: input.studentId,
        academicYearId: activeYear.id,
        classSectionId: resolvedSectionId,
      },
    },
  })
  if (existing) return { enrollmentId: existing.id }

  const result = await createYearEnrollmentForStudent({
    studentId: input.studentId,
    academicYearId: activeYear.id,
    classSectionId: resolvedSectionId,
    rollNumber: input.rollNumber,
    deliveryMode: input.deliveryMode ?? 'PHYSICAL',
  })

  return { enrollmentId: result.enrollmentId }
}

export const enrollmentInclude = {
  academicYear: { select: { id: true, name: true, isActive: true, isLocked: true } },
  classSection: {
    include: {
      campus: { select: { id: true, name: true, code: true } },
      batch: { select: { id: true, name: true, code: true } },
      shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
    },
  },
  subjectEnrollments: {
    include: {
      subjectOffering: { include: { subject: { select: { id: true, name: true, code: true } } } },
    },
  },
} as const
