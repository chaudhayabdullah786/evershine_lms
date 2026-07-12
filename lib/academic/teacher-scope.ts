import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'

export async function getTeacherByUserId(userId: string) {
  return prisma.teacher.findUnique({
    where: { userId },
    select: { id: true, campusId: true, isActive: true },
  })
}

function normalizeScopeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+morning|\s+evening|\s+night/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function legacyClassMatchesSection(
  legacy: {
    name: string
    grade: number
    section: string | null
    campusId: string
    batchId: string | null
    shift: string
  },
  section: {
    className: string
    sectionName: string
    grade: number | null
    campusId: string
    batchId: string
    shift: { code: string } | null
  }
): boolean {
  if (legacy.campusId !== section.campusId) return false
  if (legacy.grade && section.grade && legacy.grade !== section.grade) return false
  if (legacy.batchId && section.batchId && legacy.batchId !== section.batchId) return false
  if (legacy.shift && section.shift?.code && legacy.shift !== section.shift.code) return false

  const legacyName = normalizeScopeText(legacy.name)
  const sectionClassName = normalizeScopeText(section.className)
  const legacySection = normalizeScopeText(legacy.section)
  const sectionName = normalizeScopeText(section.sectionName)

  const classNameMatches =
    legacyName === sectionClassName ||
    legacyName.startsWith(sectionClassName) ||
    sectionClassName.startsWith(legacyName)

  const sectionMatches =
    !legacySection ||
    legacySection === sectionName ||
    legacyName.split(' ').includes(sectionName)

  return classNameMatches && sectionMatches
}

/** Class sections the teacher is assigned to through new engine or legacy mappings. */
export async function getTeacherClassSectionIds(
  teacherId: string,
  academicYearId?: string
): Promise<string[]> {
  let activeYear: { id: string; name: string } | null = null
  try {
    activeYear = academicYearId
      ? await prisma.academicYear?.findUnique?.({
          where: { id: academicYearId },
          select: { id: true, name: true },
        }) ?? null
      : await getActiveAcademicYear()
  } catch {
    activeYear = null
  }

  const yearId = academicYearId ?? activeYear?.id
  const yearLabel = activeYear?.name ?? academicYearId

  const [subjectOfferings, timetableSlots, classTeacherRows, subjectTeacherRows, classTasks] = await Promise.all([
    prisma.subjectOffering?.findMany?.({
      where: { teacherId, ...(yearId ? { academicYearId: yearId } : {}) },
      select: { classSectionId: true },
      distinct: ['classSectionId'],
    }) ?? [],
    prisma.timetableSlot?.findMany?.({
      where: { teacherId, ...(yearId ? { academicYearId: yearId } : {}) },
      select: { classSectionId: true },
      distinct: ['classSectionId'],
    }) ?? [],
    prisma.classTeacher?.findMany?.({
      where: {
        teacherId,
        ...(yearLabel ? { OR: [{ academicYear: yearLabel }, ...(yearId ? [{ academicYear: yearId }] : [])] } : {}),
      },
      select: { classId: true },
    }) ?? [],
    prisma.subjectTeacher?.findMany?.({
      where: { teacherId },
      select: { subject: { select: { classId: true } } },
    }) ?? [],
    prisma.classTask?.findMany?.({
      where: { teacherId },
      select: { classId: true, classSectionId: true },
    }) ?? [],
  ])

  const legacyClassIds = Array.from(new Set([
    ...classTeacherRows.map((row) => row.classId),
    ...subjectTeacherRows.map((row) => row.subject.classId),
    ...classTasks.map((row) => row.classId),
  ]))

  const legacyClasses = legacyClassIds.length
    ? await prisma.class?.findMany?.({
        where: { id: { in: legacyClassIds }, isActive: true },
        select: {
          id: true,
          name: true,
          grade: true,
          section: true,
          campusId: true,
          batchId: true,
          shift: true,
        },
      }) ?? []
    : []

  const [classSections, enrollmentMappedSections] = await Promise.all([
    prisma.classSection?.findMany?.({
      where: { isActive: true },
      select: {
        id: true,
        className: true,
        sectionName: true,
        grade: true,
        campusId: true,
        batchId: true,
        shift: { select: { code: true } },
      },
    }) ?? [],
    legacyClassIds.length && yearId
      ? prisma.studentEnrollment?.findMany?.({
          where: {
            academicYearId: yearId,
            status: 'ACTIVE',
            student: { classId: { in: legacyClassIds } },
          },
          select: { classSectionId: true },
          distinct: ['classSectionId'],
        }) ?? []
      : Promise.resolve([]),
  ])

  const legacyMappedSectionIds = classSections.filter((section) =>
    legacyClasses.some((legacy) => legacyClassMatchesSection(legacy, section))
  ).map((section) => section.id)

  return Array.from(new Set([
    ...subjectOfferings.map((row) => row.classSectionId),
    ...timetableSlots.map((row) => row.classSectionId),
    ...classTasks.flatMap((row) => row.classSectionId ? [row.classSectionId] : []),
    ...legacyMappedSectionIds,
    ...enrollmentMappedSections.map((row) => row.classSectionId),
  ]))
}

export async function teacherCanAccessClassSection(
  teacherId: string,
  classSectionId: string,
  academicYearId?: string
): Promise<boolean> {
  const allowed = await getTeacherClassSectionIds(teacherId, academicYearId)
  return allowed.includes(classSectionId)
}
