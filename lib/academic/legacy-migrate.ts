import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { autoEnrollMandatorySubjects } from '@/lib/academic/enrollment'
import { resolveMarkedByTeacherId } from '@/lib/academic/attendance'
import type { Class, SessionShift } from '@prisma/client'

export type LegacyMigrationOptions = {
  dryRun?: boolean
  academicYearId?: string
  migrateSections?: boolean
  migrateEnrollments?: boolean
  migrateSubjects?: boolean
  migrateTimetable?: boolean
  migrateAttendance?: boolean
}

export type LegacyMigrationError = {
  entity: string
  id: string
  message: string
}

export type LegacyMigrationResult = {
  dryRun: boolean
  academicYear: { id: string; name: string } | null
  sectionsCreated: number
  sectionsMatched: number
  enrollmentsCreated: number
  enrollmentsSkipped: number
  subjectsCreated: number
  offeringsCreated: number
  timetableSlotsCreated: number
  attendanceRecordsCreated: number
  classSectionMap: Record<string, string>
  errors: LegacyMigrationError[]
}

export type LegacyMigrationStatus = {
  academicYear: { id: string; name: string } | null
  legacyActiveClasses: number
  legacyStudentsWithClass: number
  engineSections: number
  engineEnrollmentsForYear: number
  studentsPendingEnrollment: number
}

export function parseLegacyClassLabels(legacy: Pick<Class, 'name' | 'grade' | 'section'>): {
  className: string
  sectionName: string
} {
  const sectionName = legacy.section?.trim() || 'A'
  const nameMatch = legacy.name.match(/class\s*(\d+)/i)
  if (nameMatch) {
    const grade = nameMatch[1]
    return { className: `Class ${grade}`, sectionName }
  }
  return { className: `Class ${legacy.grade}`, sectionName }
}

async function resolveTargetAcademicYear(academicYearId?: string) {
  if (academicYearId) {
    return prisma.academicYear.findUnique({ where: { id: academicYearId } })
  }
  return getActiveAcademicYear()
}

async function resolveShiftId(code: SessionShift): Promise<string | null> {
  const shift = await prisma.shift.findFirst({ where: { code, isActive: true } })
  return shift?.id ?? null
}

async function uniqueRollNumber(
  academicYearId: string,
  classSectionId: string,
  preferred: string,
  studentId: string
): Promise<string> {
  let candidate = preferred.trim() || `MIG-${studentId.slice(-6).toUpperCase()}`
  let suffix = 0
  while (suffix < 20) {
    const taken = await prisma.studentEnrollment.findUnique({
      where: {
        academicYearId_classSectionId_rollNumber: {
          academicYearId,
          classSectionId,
          rollNumber: candidate,
        },
      },
    })
    if (!taken) return candidate
    suffix++
    candidate = `${preferred}-${suffix}`
  }
  return `MIG-${studentId.slice(-8).toUpperCase()}`
}

/** Read-only snapshot for admin migration UI. */
export async function getLegacyMigrationStatus(
  academicYearId?: string
): Promise<LegacyMigrationStatus> {
  const academicYear = await resolveTargetAcademicYear(academicYearId)
  const legacyActiveClasses = await prisma.class.count({ where: { isActive: true } })
  const legacyStudentsWithClass = await prisma.student.count({
    where: { classId: { not: null }, enrollmentStatus: 'ACTIVE' },
  })

  const engineSections = await prisma.classSection.count({ where: { isActive: true } })
  const engineEnrollmentsForYear = academicYear
    ? await prisma.studentEnrollment.count({
        where: { academicYearId: academicYear.id, status: 'ACTIVE' },
      })
    : 0

  let studentsPendingEnrollment = 0
  if (academicYear) {
    const students = await prisma.student.findMany({
      where: { classId: { not: null }, enrollmentStatus: 'ACTIVE' },
      select: { id: true },
    })
    const enrolled = await prisma.studentEnrollment.findMany({
      where: {
        academicYearId: academicYear.id,
        studentId: { in: students.map((s) => s.id) },
        status: 'ACTIVE',
      },
      select: { studentId: true },
    })
    const enrolledSet = new Set(enrolled.map((e) => e.studentId))
    studentsPendingEnrollment = students.filter((s) => !enrolledSet.has(s.id)).length
  }

  return {
    academicYear: academicYear ? { id: academicYear.id, name: academicYear.name } : null,
    legacyActiveClasses,
    legacyStudentsWithClass,
    engineSections,
    engineEnrollmentsForYear,
    studentsPendingEnrollment,
  }
}

/**
 * Idempotent migration from legacy Class/Subject/Timetable/Attendance into the academic engine.
 * Does not delete legacy rows.
 */
export async function migrateLegacyAcademicData(
  options: LegacyMigrationOptions = {}
): Promise<LegacyMigrationResult> {
  const dryRun = options.dryRun ?? false
  const migrateSections = options.migrateSections ?? true
  const migrateEnrollments = options.migrateEnrollments ?? true
  const migrateSubjects = options.migrateSubjects ?? true
  const migrateTimetable = options.migrateTimetable ?? false
  const migrateAttendance = options.migrateAttendance ?? false

  const result: LegacyMigrationResult = {
    dryRun,
    academicYear: null,
    sectionsCreated: 0,
    sectionsMatched: 0,
    enrollmentsCreated: 0,
    enrollmentsSkipped: 0,
    subjectsCreated: 0,
    offeringsCreated: 0,
    timetableSlotsCreated: 0,
    attendanceRecordsCreated: 0,
    classSectionMap: {},
    errors: [],
  }

  const academicYear = await resolveTargetAcademicYear(options.academicYearId)
  if (!academicYear) {
    result.errors.push({
      entity: 'AcademicYear',
      id: options.academicYearId ?? 'active',
      message: 'No active academic year. Run bootstrap first.',
    })
    return result
  }
  result.academicYear = { id: academicYear.id, name: academicYear.name }

  const classSectionMap = new Map<string, string>()

  if (migrateSections) {
    const legacyClasses = await prisma.class.findMany({
      where: { isActive: true },
      include: { batch: true },
    })

    for (const legacy of legacyClasses) {
      const shiftId = await resolveShiftId(legacy.shift)
      if (!shiftId) {
        result.errors.push({
          entity: 'Class',
          id: legacy.id,
          message: `Shift ${legacy.shift} not found in engine`,
        })
        continue
      }

      let batchId = legacy.batchId
      if (!batchId) {
        const fallbackBatch = await prisma.batch.findFirst({
          where: { campusId: legacy.campusId },
          orderBy: { name: 'asc' },
        })
        batchId = fallbackBatch?.id ?? null
      }
      if (!batchId) {
        result.errors.push({
          entity: 'Class',
          id: legacy.id,
          message: 'No batch on legacy class or campus',
        })
        continue
      }

      const { className, sectionName } = parseLegacyClassLabels(legacy)

      if (dryRun) {
        const existing = await prisma.classSection.findUnique({
          where: {
            campusId_batchId_shiftId_className_sectionName: {
              campusId: legacy.campusId,
              batchId,
              shiftId,
              className,
              sectionName,
            },
          },
        })
        if (existing) {
          result.sectionsMatched++
          classSectionMap.set(legacy.id, existing.id)
        } else {
          result.sectionsCreated++
        }
        continue
      }

      const uniqueWhere = {
        campusId_batchId_shiftId_className_sectionName: {
          campusId: legacy.campusId,
          batchId,
          shiftId,
          className,
          sectionName,
        },
      }
      const existingSection = await prisma.classSection.findUnique({
        where: uniqueWhere,
      })

      const section = existingSection
        ? await prisma.classSection.update({
            where: { id: existingSection.id },
            data: {
              grade: legacy.grade,
              capacity: legacy.capacity,
              isActive: true,
            },
          })
        : await prisma.classSection.create({
            data: {
              campusId: legacy.campusId,
              batchId,
              shiftId,
              className,
              sectionName,
              grade: legacy.grade,
              deliveryMode: 'PHYSICAL',
              curriculumMode: 'FIXED',
              capacity: legacy.capacity,
              isActive: true,
            },
          })

      if (existingSection) result.sectionsMatched++
      else result.sectionsCreated++

      classSectionMap.set(legacy.id, section.id)
    }
  } else {
    const sections = await prisma.classSection.findMany({
      where: { isActive: true },
      select: {
        id: true,
        campusId: true,
        batchId: true,
        shiftId: true,
        className: true,
        sectionName: true,
      },
    })
    const legacyClasses = await prisma.class.findMany({
      where: { isActive: true },
    })
    for (const legacy of legacyClasses) {
      const shiftId = await resolveShiftId(legacy.shift)
      if (!shiftId) continue
      const { className, sectionName } = parseLegacyClassLabels(legacy)
      const match = sections.find(
        (s) =>
          s.campusId === legacy.campusId &&
          s.shiftId === shiftId &&
          (legacy.batchId ? s.batchId === legacy.batchId : true) &&
          s.className === className &&
          s.sectionName === sectionName
      )
      if (match) classSectionMap.set(legacy.id, match.id)
    }
  }

  result.classSectionMap = Object.fromEntries(classSectionMap)

  if (migrateEnrollments) {
    const students = await prisma.student.findMany({
      where: {
        classId: { not: null },
        enrollmentStatus: 'ACTIVE',
      },
      select: {
        id: true,
        classId: true,
        rollNumber: true,
        deliveryMode: true,
      },
    })

    for (const student of students) {
      const classSectionId = student.classId ? classSectionMap.get(student.classId) : undefined
      if (!classSectionId) {
        result.enrollmentsSkipped++
        continue
      }

      const existing = await prisma.studentEnrollment.findUnique({
        where: {
          studentId_academicYearId_classSectionId: {
            studentId: student.id,
            academicYearId: academicYear.id,
            classSectionId,
          },
        },
      })
      if (existing) {
        result.enrollmentsSkipped++
        continue
      }

      const preferredRoll =
        student.rollNumber?.trim() ||
        `MIG-${student.id.slice(-6).toUpperCase()}`

      if (dryRun) {
        result.enrollmentsCreated++
        continue
      }

      try {
        const rollNumber = await uniqueRollNumber(
          academicYear.id,
          classSectionId,
          preferredRoll,
          student.id
        )
        const enrollment = await prisma.studentEnrollment.create({
          data: {
            studentId: student.id,
            academicYearId: academicYear.id,
            classSectionId,
            rollNumber,
            deliveryMode: student.deliveryMode,
            status: 'ACTIVE',
          },
        })
        await autoEnrollMandatorySubjects(
          enrollment.id,
          classSectionId,
          academicYear.id
        )
        result.enrollmentsCreated++
      } catch (e) {
        result.errors.push({
          entity: 'Student',
          id: student.id,
          message: e instanceof Error ? e.message : 'Enrollment failed',
        })
      }
    }
  }

  if (migrateSubjects) {
    const legacySubjects = await prisma.subject.findMany({
      where: { isActive: true },
      include: {
        teachers: { take: 1 },
      },
    })

    for (const sub of legacySubjects) {
      const classSectionId = classSectionMap.get(sub.classId)
      if (!classSectionId) continue

      if (dryRun) {
        const acad = await prisma.academicSubject.findFirst({ where: { code: sub.code } })
        if (!acad) result.subjectsCreated++
        const off = await prisma.subjectOffering.findFirst({
          where: {
            academicYearId: academicYear.id,
            classSectionId,
            subject: { code: sub.code },
          },
        })
        if (!off) result.offeringsCreated++
        continue
      }

      let academicSubject = await prisma.academicSubject.findUnique({
        where: { code: sub.code },
      })
      if (!academicSubject) {
        academicSubject = await prisma.academicSubject.create({
          data: {
            name: sub.name,
            code: sub.code,
            isActive: true,
          },
        })
        result.subjectsCreated++
      }

      const teacherId = sub.teachers[0]?.teacherId
      const existingOffering = await prisma.subjectOffering.findUnique({
        where: {
          academicYearId_classSectionId_subjectId: {
            academicYearId: academicYear.id,
            classSectionId,
            subjectId: academicSubject.id,
          },
        },
      })
      if (!existingOffering) {
        await prisma.subjectOffering.create({
          data: {
            academicYearId: academicYear.id,
            classSectionId,
            subjectId: academicSubject.id,
            teacherId: teacherId ?? null,
            isMandatory: !sub.isElective,
          },
        })
        result.offeringsCreated++
      }
    }
  }

  if (migrateTimetable) {
    const slots = await prisma.timetable.findMany({ where: { isActive: true } })

    for (const slot of slots) {
      const classSectionId = classSectionMap.get(slot.classId)
      if (!classSectionId) continue

      const offering = await prisma.subjectOffering.findFirst({
        where: {
          academicYearId: academicYear.id,
          classSectionId,
          subject: { name: { equals: slot.subjectName } },
        },
      })
      if (!offering) {
        result.errors.push({
          entity: 'Timetable',
          id: slot.id,
          message: `No subject offering for ${slot.subjectName}`,
        })
        continue
      }

      const engineDay = slot.dayOfWeek >= 1 && slot.dayOfWeek <= 7 ? slot.dayOfWeek : slot.dayOfWeek + 1

      if (dryRun) {
        result.timetableSlotsCreated++
        continue
      }

      const dup = await prisma.timetableSlot.findFirst({
        where: {
          academicYearId: academicYear.id,
          classSectionId,
          subjectOfferingId: offering.id,
          dayOfWeek: engineDay,
          startTime: slot.startTime,
        },
      })
      if (dup) continue

      await prisma.timetableSlot.create({
        data: {
          academicYearId: academicYear.id,
          classSectionId,
          subjectOfferingId: offering.id,
          teacherId: slot.teacherId,
          dayOfWeek: engineDay,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isPublished: true,
        },
      })
      result.timetableSlotsCreated++
    }
  }

  if (migrateAttendance) {
    const records = await prisma.attendance.findMany({
      orderBy: { date: 'asc' },
      take: 5000,
    })

    for (const rec of records) {
      const classSectionId = classSectionMap.get(rec.classId)
      if (!classSectionId) continue

      const enrollment = await prisma.studentEnrollment.findFirst({
        where: {
          studentId: rec.studentId,
          academicYearId: academicYear.id,
          classSectionId,
          status: 'ACTIVE',
        },
      })
      if (!enrollment) continue

      if (dryRun) {
        result.attendanceRecordsCreated++
        continue
      }

      const markedBy = await resolveMarkedByTeacherId(rec.markedBy)

      await prisma.enrollmentAttendanceRecord.upsert({
        where: {
          studentEnrollmentId_attendanceDate: {
            studentEnrollmentId: enrollment.id,
            attendanceDate: rec.date,
          },
        },
        create: {
          studentEnrollmentId: enrollment.id,
          attendanceDate: rec.date,
          status: rec.status,
          markedByTeacherId: markedBy,
          remarks: rec.remarks,
        },
        update: {
          status: rec.status,
          markedByTeacherId: markedBy,
          remarks: rec.remarks,
        },
      })
      result.attendanceRecordsCreated++
    }
  }

  return result
}
