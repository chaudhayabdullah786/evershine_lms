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

  // 2. Fetch existing StudentEnrollment records for this ClassSection.
  //    Filters are applied at the DB level to prevent over-fetching.
  const baseWhere: Record<string, unknown> = {
    classSectionId: targetClassSectionId,
    status: 'ACTIVE',
  }

  // WHY separate nested objects: Prisma does not allow merging nested
  // `classSection` objects; we must build one nested filter object.
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

  // 3. Fallback: Query across all academic years if the specific year yielded 0.
  //    WHY: Some campuses enrolled students in a prior year and haven't run
  //    a year-rollover. We tolerate a year mismatch to avoid empty rosters.
  if (enrollments.length === 0 && academicYearId && prisma.studentEnrollment?.findMany) {
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

  // 4. Global Auto-Sync: If StudentEnrollment is still empty, find direct
  //    Student records and auto-enroll them. This handles campuses that
  //    admitted students via the legacy admission flow (Student.classId).
  //
  //    SECURITY: We strictly filter by grade AND shift code to prevent a
  //    Morning-shift teacher from seeing Evening-shift students in their roster.
  if (enrollments.length === 0 && prisma.student?.findMany) {
    const activeYear = academicYearId
      ? (prisma.academicYear?.findUnique
          ? await prisma.academicYear.findUnique({ where: { id: academicYearId } })
          : null)
      : await getActiveAcademicYear()

    // Build a shift-aware where clause for direct students.
    // WHY `class: { grade: section.grade }` and NOT `lastClassPassed`:
    //   `lastClassPassed` stores the grade the student passed BEFORE admission
    //   and is not updated during the academic year. `class.grade` is the grade
    //   the student is CURRENTLY enrolled in, which is what we need here.
    const directStudentWhere: Record<string, unknown> = {
      isActive: true,
      enrollmentStatus: 'ACTIVE',
      OR: [
        // Path A: Student directly linked to this ClassSection ID (modern path).
        { classId: targetClassSectionId },
        // Path B: Student linked to legacy Class ID.
        ...(legacyClassId ? [{ classId: legacyClassId }] : []),
        // Path C: Structural match — campus + grade + section + shift.
        //   This is the primary path for legacy admissions.
        //   Shift enforcement is mandatory to prevent cross-shift leakage.
        ...(section
          ? [
              {
                campusId: section.campusId,
                ...(section.batchId ? { batchId: section.batchId } : {}),
                ...(section.sectionName
                  ? { section: section.sectionName }
                  : {}),
                // WHY single `class` filter: both grade AND shift must be
                // in the same nested object. JavaScript object spread would
                // silently overwrite an earlier `class` key, causing the grade
                // constraint to be dropped when shift is also present.
                // SHIFT ENFORCEMENT: Only students whose Class record shares
                // the same shift code as the target ClassSection are eligible.
                // This is the primary defence against cross-shift data leakage.
                ...((section.grade || section.shift?.code)
                  ? {
                      class: {
                        ...(section.grade ? { grade: section.grade } : {}),
                        ...(section.shift?.code
                          ? { shift: section.shift.code }
                          : {}),
                      },
                    }
                  : {}),
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

    if (directStudents.length > 0 && activeYear && targetClassSectionId && prisma.studentEnrollment?.upsert) {
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
