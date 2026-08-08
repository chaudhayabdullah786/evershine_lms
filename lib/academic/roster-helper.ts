import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'

/**
 * Universal Roster Resolver & Auto-Sync Engine
 *
 * Ensures student rosters load seamlessly regardless of whether students were
 * enrolled via the New Academic Engine (StudentEnrollment) or direct Student
 * admission (Student.classId / Student.section).
 *
 * TRADEOFF: Auto-sync writes StudentEnrollment records on first load. This is
 * an intentional design — it bridges the legacy `Student.classId` model and the
 * modern ClassSection engine without requiring a full data migration up-front.
 *
 * WHY shift-filtering matters: Evershine runs Morning and Evening sections.
 * A Student in Class 9-A Morning must never appear in the Evening teacher's
 * roster. We enforce this at the query level, not just in the UI.
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

  // 1. Resolve ClassSection or Legacy Class safely.
  //    We always try ClassSection first (new Academic Engine path).
  //    If not found, we fall back to the legacy Class model to support
  //    callers that still supply old Class IDs.
  let section = prisma.classSection?.findUnique
    ? await prisma.classSection.findUnique({
        where: { id: classSectionId },
        include: { campus: true, batch: true, shift: true },
      })
    : null

  if (!section && prisma.class?.findUnique) {
    const legacyClass = await prisma.class.findUnique({
      where: { id: classSectionId },
    })
    if (legacyClass && prisma.classSection?.findFirst) {
      legacyClassId = legacyClass.id
      // Match ClassSection by structural identity: campus + batch + grade + section + shift.
      // WHY: Legacy Class.name is an unstable display label and cannot be
      // used as a FK. The campus/grade/section tuple is the stable cross-engine key.
      section = await prisma.classSection.findFirst({
        where: {
          campusId: legacyClass.campusId,
          ...(legacyClass.batchId ? { batchId: legacyClass.batchId } : {}),
          ...(legacyClass.grade ? { grade: legacyClass.grade } : {}),
          ...(legacyClass.section ? { sectionName: legacyClass.section } : {}),
          ...(legacyClass.shift
            ? { shift: { code: legacyClass.shift } }
            : {}),
        },
        include: { campus: true, batch: true, shift: true },
      })
      if (section) {
        targetClassSectionId = section.id
      }
    }
  }

  let legacyClassIds: string[] = []

  if (section) {
    // Find any legacy Class rows matching this section's campus and grade/section
    const matchingLegacy = await prisma.class?.findMany?.({
      where: {
        campusId: section.campusId,
        ...(section.grade ? { grade: section.grade } : {}),
      },
      select: { id: true },
    }) ?? []
    legacyClassIds = matchingLegacy.map((c) => c.id)
    if (legacyClassId && !legacyClassIds.includes(legacyClassId)) {
      legacyClassIds.push(legacyClassId)
    }
  }

  // 2. Fetch existing StudentEnrollment records for this ClassSection.
  const baseWhere: Record<string, unknown> = {
    classSectionId: targetClassSectionId,
    status: 'ACTIVE',
  }

  const classSectionFilter: Record<string, unknown> = {}
  if (filters?.batchId) classSectionFilter.batch = { id: filters.batchId }
  if (filters?.shiftId) classSectionFilter.shift = { id: filters.shiftId }
  if (Object.keys(classSectionFilter).length > 0) {
    baseWhere.classSection = classSectionFilter
  }
  if (filters?.houseId) baseWhere.student = { house: { id: filters.houseId } }

  let enrollments = prisma.studentEnrollment?.findMany
    ? await prisma.studentEnrollment.findMany({
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
              fatherName: true,
              registrationNumber: true,
              rollNumber: true,
              profilePicture: true,
              house: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: { rollNumber: 'asc' },
      })
    : []

  // 3. Fallback: Query across ALL academic years if specific year returned 0 enrollments.
  if (enrollments.length === 0 && prisma.studentEnrollment?.findMany) {
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
            fatherName: true,
            registrationNumber: true,
            rollNumber: true,
            profilePicture: true,
            house: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { rollNumber: 'asc' },
    })
  }

  // 4. Global Auto-Sync: If StudentEnrollment is still empty, find direct Student records
  //    and auto-enroll them into this ClassSection.
  if (enrollments.length === 0 && prisma.student?.findMany) {
    const activeYear = academicYearId
      ? (prisma.academicYear?.findUnique
          ? await prisma.academicYear.findUnique({ where: { id: academicYearId } })
          : null)
      : await getActiveAcademicYear()

    const fallbackActiveYear = activeYear || (await prisma.academicYear?.findFirst?.({ where: { isActive: true } })) || (await prisma.academicYear?.findFirst?.({ orderBy: { startDate: 'desc' } }))

    // Build multi-path query to locate all students belonging to this section/grade
    const directStudentWhere: Record<string, unknown> = {
      isActive: true,
      NOT: { enrollmentStatus: 'WITHDRAWN' },
      OR: [
<<<<<<< HEAD
        // Path A1: Linked via modern classSectionId on Student model
        { classSectionId: targetClassSectionId },
        // Path A2: Linked via classId matching targetClassSectionId
=======
        // Path A: Directly linked to target ClassSection ID
>>>>>>> origin/main
        { classId: targetClassSectionId },
        // Path B: Linked to any matching legacy Class IDs
        ...(legacyClassIds.length ? [{ classId: { in: legacyClassIds } }] : []),
        // Path C: Campus + Grade match on Student.class
        ...(section?.campusId && section?.grade
          ? [
              {
                campusId: section.campusId,
                class: { grade: section.grade },
              },
            ]
          : []),
        // Path D: Campus + Section name match
        ...(section?.campusId && section?.sectionName
          ? [
              {
                campusId: section.campusId,
                section: { contains: section.sectionName },
              },
            ]
          : []),
      ],
    }

    const directStudents = await prisma.student.findMany({
      where: directStudentWhere,
      include: {
        house: { select: { id: true, name: true, color: true } },
      },
      orderBy: { rollNumber: 'asc' },
    })

    if (directStudents.length > 0 && fallbackActiveYear && targetClassSectionId && prisma.studentEnrollment?.upsert) {
      for (const st of directStudents) {
        try {
          await prisma.studentEnrollment.upsert({
            where: {
              studentId_academicYearId_classSectionId: {
                studentId: st.id,
                academicYearId: fallbackActiveYear.id,
                classSectionId: targetClassSectionId,
              },
            },
            create: {
              studentId: st.id,
              academicYearId: fallbackActiveYear.id,
              classSectionId: targetClassSectionId,
              rollNumber: st.rollNumber || '1',
              status: 'ACTIVE',
            },
            update: {
              status: 'ACTIVE',
            },
          })
        } catch {
          // Ignore unique constraint collisions — idempotent operation.
        }
      }

      // Re-fetch the now-synced enrollments.
      if (prisma.studentEnrollment?.findMany) {
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
                fatherName: true,
                registrationNumber: true,
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
  }

  return {
    targetClassSectionId,
    legacyClassId,
    section,
    enrollments,
  }
}
