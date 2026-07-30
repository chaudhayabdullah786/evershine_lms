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

function normalizeShiftKey(value: string | null | undefined): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .replace(/SHIFT$/, '')
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
  },
  strictness: 'strict' | 'ignore-batch' | 'ignore-batch-shift' = 'strict'
): boolean {
  if (legacy.campusId !== section.campusId) return false
  if (legacy.grade && section.grade && legacy.grade !== section.grade) return false

  if (
    strictness === 'strict' &&
    legacy.batchId &&
    section.batchId &&
    legacy.batchId !== section.batchId
  ) {
    return false
  }

  const legacyShift = normalizeShiftKey(legacy.shift)
  const sectionShift = normalizeShiftKey(section.shift?.code)
  if (
    strictness !== 'ignore-batch-shift' &&
    legacyShift &&
    sectionShift &&
    legacyShift !== sectionShift
  ) {
    return false
  }

  const legacySection = normalizeScopeText(legacy.section)
  const sectionName = normalizeScopeText(section.sectionName)
  const legacyName = normalizeScopeText(legacy.name)

  // `Class.name` is a legacy display label and is not a stable foreign key.
  // In production it can be "Class 11 - A", "XI A", or a batch-specific
  // label while ClassSection.className has a different naming convention.
  // The stable cross-engine identity is campus + grade + section, with batch
  // and shift used above to narrow the match whenever they are available.
  const sectionMatches =
    !legacySection ||
    legacySection === sectionName ||
    legacyName.split(' ').includes(sectionName)

  return sectionMatches
}

function selectUnambiguousLegacySectionMatches(
  legacy: {
    name: string
    section: string | null
  },
  candidates: Array<{
    id: string
    className: string
    sectionName: string
  }>
): string[] {
  if (candidates.length === 1) return [candidates[0].id]
  if (candidates.length === 0) return []

  // Multiple sections can share the same grade/section when the legacy
  // database drifted. Use the old display name only as a tie-breaker; never
  // widen a teacher's scope when the association remains ambiguous.
  const legacyName = normalizeScopeText(legacy.name)
  const nameMatches = candidates.filter((section) => {
    const className = normalizeScopeText(section.className)
    const fullSectionName = normalizeScopeText(`${section.className} ${section.sectionName}`)
    return (
      legacyName === className ||
      legacyName === fullSectionName ||
      legacyName.startsWith(className) ||
      className.startsWith(legacyName)
    )
  })

  return nameMatches.length === 1 ? [nameMatches[0].id] : []
}

function mapLegacyClassesToSections(
  legacyClasses: Array<{
    name: string
    grade: number
    section: string | null
    campusId: string
    batchId: string | null
    shift: string
  }>,
  classSections: Array<{
    id: string
    className: string
    sectionName: string
    grade: number | null
    campusId: string
    batchId: string
    shift: { code: string } | null
  }>
): string[] {
  const mapped = new Set<string>()

  for (const legacy of legacyClasses) {
    // Prefer the most precise identifiers first. Each lower tier exists for
    // documented migration drift between legacy Class and ClassSection rows.
    // `selectUnambiguousLegacySectionMatches` keeps the fallback least-privilege.
    const strictMatches = classSections.filter((section) =>
      legacyClassMatchesSection(legacy, section, 'strict')
    )
    const shiftMatches = classSections.filter((section) =>
      legacyClassMatchesSection(legacy, section, 'ignore-batch')
    )
    const fallbackMatches = classSections.filter((section) =>
      legacyClassMatchesSection(legacy, section, 'ignore-batch-shift')
    )

    const mappedIds = [strictMatches, shiftMatches, fallbackMatches]
      .map((candidates) => selectUnambiguousLegacySectionMatches(legacy, candidates))
      .find((sectionIds) => sectionIds.length > 0) ?? []

    mappedIds.forEach((sectionId) => mapped.add(sectionId))
  }

  return Array.from(mapped)
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

  const [
    subjectOfferings,
    timetableSlots,
    activeClassTeacherRows,
    allClassTeacherRows,
    subjectTeacherRows,
    classTasks,
    teacherOwnedResults,
  ] = await Promise.all([
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
    prisma.classTeacher?.findMany?.({
      where: { teacherId },
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
    prisma.termResult?.findMany?.({
      where: { teacherId },
      select: { classSectionId: true },
      distinct: ['classSectionId'],
    }) ?? [],
  ])

  const classTeacherRows = activeClassTeacherRows.length > 0
    ? activeClassTeacherRows
    : allClassTeacherRows

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

  const legacyMappedSectionIds = mapLegacyClassesToSections(legacyClasses, classSections)

  return Array.from(new Set([
    ...subjectOfferings.map((row) => row.classSectionId),
    ...timetableSlots.map((row) => row.classSectionId),
    ...classTasks.flatMap((row) => row.classSectionId ? [row.classSectionId] : []),
    ...teacherOwnedResults.map((row) => row.classSectionId),
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
