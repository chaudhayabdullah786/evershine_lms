import { prisma } from '@/lib/prisma'

export type TeacherSectionAssignmentRecord = {
  id: string
  teacherId: string
  classSectionId: string
  academicYearId: string
  isClassTeacher: boolean
  status: 'ACTIVE' | 'REVOKED'
}

/**
 * Current teacher scope is intentionally backed by one table. Subject
 * offerings and timetable slots describe teaching details, but they do not
 * grant access to a section on their own. This prevents historical records
 * from leaking into current teacher workflows.
 */
export async function getTeacherSectionAssignments(
  teacherId: string,
  academicYearId: string,
) {
  return prisma.teacherSectionAssignment.findMany({
    where: {
      teacherId,
      academicYearId,
      status: 'ACTIVE',
      classSection: { isActive: true },
    },
    select: {
      id: true,
      teacherId: true,
      classSectionId: true,
      academicYearId: true,
      isClassTeacher: true,
      status: true,
      classSection: {
        select: {
          id: true,
          className: true,
          sectionName: true,
          grade: true,
          campusId: true,
          batchId: true,
          deliveryMode: true,
          campus: { select: { id: true, name: true, code: true } },
          batch: { select: { id: true, name: true, code: true, academicLevel: true } },
          shift: { select: { code: true, name: true } },
          _count: { select: { enrollments: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getTeacherAssignedSectionIds(
  teacherId: string,
  academicYearId: string,
): Promise<string[]> {
  const assignments = await getTeacherSectionAssignments(teacherId, academicYearId)
  return assignments.map((assignment) => assignment.classSectionId)
}

export async function upsertTeacherSectionAssignment(params: {
  teacherId: string
  classSectionId: string
  academicYearId: string
  isClassTeacher: boolean
  db?: typeof prisma
}) {
  const db = params.db ?? prisma
  return db.teacherSectionAssignment.upsert({
    where: {
      teacherId_classSectionId_academicYearId: {
        teacherId: params.teacherId,
        classSectionId: params.classSectionId,
        academicYearId: params.academicYearId,
      },
    },
    update: {
      isClassTeacher: params.isClassTeacher,
      status: 'ACTIVE',
    },
    create: {
      teacherId: params.teacherId,
      classSectionId: params.classSectionId,
      academicYearId: params.academicYearId,
      isClassTeacher: params.isClassTeacher,
      status: 'ACTIVE',
    },
  })
}
