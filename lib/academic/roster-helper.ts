import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'

/**
 * Universal Roster Resolver & Auto-Sync Engine
 *
 * Ensures student rosters load seamlessly regardless of whether students were
 * enrolled via the New Academic Engine (StudentEnrollment) or direct Student
 * admission (Student.classId / Student.section).
 */
export async function getOrSyncSectionEnrollments(
  classSectionId: string,
  academicYearId?: string,
  filters?: {
    batchId?: string
    shiftId?: string
    houseId?: string
  }
) {
  let targetClassSectionId = classSectionId
  let legacyClassId: string | null = null

  // 1. Resolve ClassSection or Legacy Class
  let section = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: { campus: true, batch: true, shift: true },
  })

  if (!section) {
    const legacyClass = await prisma.class.findUnique({
      where: { id: classSectionId },
    })
    if (legacyClass) {
      legacyClassId = legacyClass.id
      section = await prisma.classSection.findFirst({
        where: {
          campusId: legacyClass.campusId,
          batchId: legacyClass.batchId,
          ...(legacyClass.grade ? { grade: legacyClass.grade } : {}),
          ...(legacyClass.section ? { sectionName: legacyClass.section } : {}),
        },
        include: { campus: true, batch: true, shift: true },
      })
      if (section) {
        targetClassSectionId = section.id
      }
    }
  }

  // 2. Fetch existing StudentEnrollment records
  const baseWhere: any = {
    classSectionId: targetClassSectionId,
    status: 'ACTIVE',
  }

  if (filters?.batchId) baseWhere.classSection = { batch: { id: filters.batchId } }
  if (filters?.shiftId) baseWhere.classSection = { ...baseWhere.classSection, shift: { id: filters.shiftId } }
  if (filters?.houseId) baseWhere.student = { house: { id: filters.houseId } }

  let enrollments = await prisma.studentEnrollment.findMany({
    where: {
      ...baseWhere,
      ...(academicYearId ? { academicYearId } : {}),
    },
    include: {
      classSection: {
        select: {
          batch: { select: { id: true, name: true } },
          shift: { select: { id: true, name: true } },
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          profilePicture: true,
          house: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { rollNumber: 'asc' },
  })

  // 3. Fallback: Query across all academic years if academicYearId query yielded 0
  if (enrollments.length === 0 && academicYearId) {
    enrollments = await prisma.studentEnrollment.findMany({
      where: baseWhere,
      include: {
        classSection: {
          select: {
            batch: { select: { id: true, name: true } },
            shift: { select: { id: true, name: true } },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            profilePicture: true,
            house: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { rollNumber: 'asc' },
    })
  }

  // 4. Global Auto-Sync: If StudentEnrollment is still empty, find direct Student records & auto-enroll
  if (enrollments.length === 0) {
    const activeYear = academicYearId
      ? await prisma.academicYear.findUnique({ where: { id: academicYearId } })
      : await getActiveAcademicYear()

    const directStudents = await prisma.student.findMany({
      where: {
        OR: [
          { classId: targetClassSectionId },
          ...(legacyClassId ? [{ classId: legacyClassId }] : []),
          ...(section
            ? [
                {
                  campusId: section.campusId,
                  batchId: section.batchId,
                  ...(section.grade ? { lastClassPassed: section.grade } : {}),
                  ...(section.sectionName ? { section: section.sectionName } : {}),
                },
              ]
            : []),
        ],
      },
      include: {
        house: { select: { id: true, name: true, color: true } },
      },
      orderBy: { rollNumber: 'asc' },
    })

    if (directStudents.length > 0 && activeYear && targetClassSectionId) {
      for (const st of directStudents) {
        try {
          await prisma.studentEnrollment.upsert({
            where: {
              studentId_academicYearId_classSectionId: {
                studentId: st.id,
                academicYearId: activeYear.id,
                classSectionId: targetClassSectionId,
              },
            },
            create: {
              studentId: st.id,
              academicYearId: activeYear.id,
              classSectionId: targetClassSectionId,
              rollNumber: st.rollNumber || '1',
              status: 'ACTIVE',
            },
            update: {
              status: 'ACTIVE',
            },
          })
        } catch {
          // Ignore unique constraint collisions
        }
      }

      // Re-fetch sync'd enrollments
      enrollments = await prisma.studentEnrollment.findMany({
        where: baseWhere,
        include: {
          classSection: {
            select: {
              batch: { select: { id: true, name: true } },
              shift: { select: { id: true, name: true } },
            },
          },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rollNumber: true,
              profilePicture: true,
              house: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: { rollNumber: 'asc' },
      })
    }
  }

  return {
    targetClassSectionId,
    legacyClassId,
    section,
    enrollments,
  }
}
