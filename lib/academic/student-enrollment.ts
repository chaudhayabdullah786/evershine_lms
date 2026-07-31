import { prisma } from '@/lib/prisma'

export async function getActiveEnrollmentsForStudent(
  studentId: string,
  academicYearId: string
) {
  return prisma.studentEnrollment.findMany({
    where: { studentId, academicYearId, status: 'ACTIVE' },
    include: {
      classSection: {
        // WHY: curriculumMode must be fetched here so the auto-backfill logic
        // in the enrollment API can check `classSection.curriculumMode === 'FIXED'`.
        // Without this field the condition evaluates to undefined (falsy) and
        // mandatory subjects are never backfilled for FIXED curriculum students.
        include: { campus: true, batch: true, shift: true },
      },
      subjectEnrollments: {
        include: {
          subjectOffering: {
            include: { subject: true, teacher: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

/** Primary enrollment (first active) — backward compatible for single-shift students. */
export async function getPrimaryEnrollmentForStudent(
  studentId: string,
  academicYearId: string
) {
  return prisma.studentEnrollment.findFirst({
    where: { studentId, academicYearId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: {
      classSection: {
        include: { campus: true, batch: true, shift: true },
      },
      subjectEnrollments: {
        include: {
          subjectOffering: {
            include: { subject: true, teacher: true },
          },
        },
      },
    },
  })
}
