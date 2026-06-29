import { prisma } from '@/lib/prisma'
import type { SessionShift } from '@/lib/validation/shift'

async function resolveLegacyClass(classId: string) {
  return prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      grade: true,
      section: true,
      campusId: true,
      batchId: true,
      shift: true,
    },
  })
}

async function resolveClassSectionIdForLegacyClass(legacyClass: { grade: number; section: string | null; campusId: string; batchId: string | null; shift: string }) {
  const shift = await prisma.shift.findFirst({
    where: { code: legacyClass.shift as SessionShift },
    select: { id: true },
  })

  if (!shift) return null

  return prisma.classSection.findFirst({
    where: {
      grade: legacyClass.grade,
      sectionName: legacyClass.section ?? '',
      campusId: legacyClass.campusId,
      batchId: legacyClass.batchId ?? undefined,
      shiftId: shift.id,
    },
    select: { id: true },
  })
}

async function resolveClassContext(classId: string) {
  const legacyClass = await resolveLegacyClass(classId)
  if (legacyClass) {
    const classSection = await resolveClassSectionIdForLegacyClass(legacyClass)
    return {
      legacyClassId: legacyClass.id,
      classSectionId: classSection?.id ?? null,
    }
  }

  const classSection = await prisma.classSection.findUnique({
    where: { id: classId },
    select: {
      id: true,
      grade: true,
      sectionName: true,
      campusId: true,
      batchId: true,
      shift: { select: { code: true, name: true } },
    },
  })

  if (!classSection) {
    return { legacyClassId: null, classSectionId: null }
  }

  const shiftCode = (classSection.shift?.code ?? classSection.shift?.name ?? '').toUpperCase().replace(/\s+/g, '')
  const mappedLegacyClass = await prisma.class.findFirst({
    where: {
      grade: classSection.grade ?? 0,
      section: classSection.sectionName ?? '',
      campusId: classSection.campusId,
      batchId: classSection.batchId ?? null,
      shift: shiftCode as never,
      isActive: true,
    },
    select: { id: true },
  })

  return {
    legacyClassId: mappedLegacyClass?.id ?? null,
    classSectionId: classSection.id,
  }
}

export async function teacherCanAccessClassOrSubject(teacherId: string, classId: string, subjectId?: string) {
  const context = await resolveClassContext(classId)

  const directClassTeacher = context.legacyClassId
    ? await prisma.classTeacher.findFirst({
        where: { classId: context.legacyClassId, teacherId },
      })
    : null
  if (directClassTeacher) return true

  if (subjectId) {
    if (context.legacyClassId) {
      const directSubjectTeacher = await prisma.subjectTeacher.findFirst({
        where: {
          teacherId,
          subjectId,
          subject: { classId: context.legacyClassId },
        },
      })
      if (directSubjectTeacher) return true
    }

    if (context.classSectionId) {
      const sectionSubjectTeacher = await prisma.subjectOffering.findFirst({
        where: {
          teacherId,
          classSectionId: context.classSectionId,
          subjectId,
        },
      })
      if (sectionSubjectTeacher) return true
    }
  }

  if (context.classSectionId) {
    const sectionAssignment = await prisma.subjectOffering.findFirst({
      where: { teacherId, classSectionId: context.classSectionId },
    })
    if (sectionAssignment) return true

    const publishedSlot = await prisma.timetableSlot.findFirst({
      where: { teacherId, classSectionId: context.classSectionId, isPublished: true },
    })
    if (publishedSlot) return true
  }

  return false
}
