import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'

export async function getTeacherByUserId(userId: string) {
  return prisma.teacher.findUnique({
    where: { userId },
    select: { id: true, campusId: true, isActive: true },
  })
}

/** Class sections the teacher is assigned to via subject offerings in the active year. */
export async function getTeacherClassSectionIds(
  teacherId: string,
  academicYearId?: string
): Promise<string[]> {
  const activeYear = academicYearId
    ? await prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { id: true, name: true },
      })
    : await getActiveAcademicYear()

  const yearId = activeYear?.id
  const yearLabel = activeYear?.name
  if (!yearId || !yearLabel) return []

  const [subjectOfferings, timetableSlots, classTeacherRows, subjectTeacherRows] = await Promise.all([
    prisma.subjectOffering?.findMany?.({
      where: { teacherId, academicYearId: yearId },
      select: { classSectionId: true },
      distinct: ['classSectionId'],
    }) ?? [],
    prisma.timetableSlot?.findMany?.({
      where: { teacherId, academicYearId: yearId, isPublished: true },
      select: { classSectionId: true },
      distinct: ['classSectionId'],
    }) ?? [],
    prisma.classTeacher?.findMany?.({
      where: {
        teacherId,
        OR: [{ academicYear: yearLabel }, { academicYear: yearId }],
      },
      select: { classId: true },
    }) ?? [],
    prisma.subjectTeacher?.findMany?.({
      where: { teacherId },
      select: { subject: { select: { classId: true } } },
    }) ?? [],
  ])

  const legacyClassIds = Array.from(new Set([
    ...classTeacherRows.map((row) => row.classId),
    ...subjectTeacherRows.map((row) => row.subject.classId),
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

  const classSections = await prisma.classSection?.findMany?.({
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
  }) ?? []

  const legacyMappedSectionIds = classSections.filter((section) =>
    legacyClasses.some((legacy) => {
      const legacyClassName = legacy.name?.replace(/\s+Morning|\s+Evening/i, '').trim()
      const sectionClassName = section.className?.replace(/\s+Morning|\s+Evening/i, '').trim()
      return (
        legacyClassName === sectionClassName &&
        legacy.grade === section.grade &&
        legacy.section === section.sectionName &&
        legacy.campusId === section.campusId &&
        legacy.batchId === section.batchId &&
        legacy.shift === section.shift?.code
      )
    })
  ).map((section) => section.id)

  return Array.from(new Set([
    ...subjectOfferings.map((row) => row.classSectionId),
    ...timetableSlots.map((row) => row.classSectionId),
    ...legacyMappedSectionIds,
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
