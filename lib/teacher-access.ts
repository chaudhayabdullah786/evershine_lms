import { prisma } from '@/lib/prisma'
import type { SessionShift } from '@/lib/validation/shift'
import { getActiveAcademicYear } from '@/lib/academic/engine'

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

  // 1. Try exact match with batchId
  let section = await prisma.classSection.findFirst({
    where: {
      grade: legacyClass.grade,
      sectionName: legacyClass.section ?? '',
      campusId: legacyClass.campusId,
      batchId: legacyClass.batchId ?? undefined,
      shiftId: shift.id,
    },
    select: { id: true },
  })
  if (section) return section

  // 2. Fallback: try without batchId
  section = await prisma.classSection.findFirst({
    where: {
      grade: legacyClass.grade,
      sectionName: legacyClass.section ?? '',
      campusId: legacyClass.campusId,
      shiftId: shift.id,
    },
    select: { id: true },
  })
  if (section) return section

  // 3. Fallback: try without shiftId
  section = await prisma.classSection.findFirst({
    where: {
      grade: legacyClass.grade,
      sectionName: legacyClass.section ?? '',
      campusId: legacyClass.campusId,
    },
    select: { id: true },
  })
  return section
}

export async function findLegacyClassForSection(params: {
  grade: number | null
  sectionName: string | null
  campusId: string
  batchId: string | null
  shiftCode: string
  academicYear?: string | null
}) {
  const grade = params.grade ?? 0
  const sectionName = params.sectionName ?? ''
  const campusId = params.campusId
  const batchId = params.batchId
  const shift = params.shiftCode
  const academicYear = params.academicYear

  // 1. Try exact match (with batchId, shift, academicYear)
  let cls = await prisma.class.findFirst({
    where: {
      grade,
      section: sectionName,
      campusId,
      batchId,
      shift: shift as any,
      ...(academicYear ? { academicYear } : {}),
      isActive: true,
    },
    select: { id: true, name: true, section: true, batchId: true, shift: true, campusId: true, grade: true, academicYear: true },
  })
  if (cls) return cls

  // 2. Try matching without academicYear (in case of year mismatch)
  cls = await prisma.class.findFirst({
    where: {
      grade,
      section: sectionName,
      campusId,
      batchId,
      shift: shift as any,
      isActive: true,
    },
    select: { id: true, name: true, section: true, batchId: true, shift: true, campusId: true, grade: true, academicYear: true },
  })
  if (cls) return cls

  // 3. Try matching without batchId (since batchId might be null or different in legacy Class)
  cls = await prisma.class.findFirst({
    where: {
      grade,
      section: sectionName,
      campusId,
      shift: shift as any,
      isActive: true,
    },
    select: { id: true, name: true, section: true, batchId: true, shift: true, campusId: true, grade: true, academicYear: true },
  })
  if (cls) return cls

  // 4. Try matching without shift filter (in case of shift enum mismatch)
  cls = await prisma.class.findFirst({
    where: {
      grade,
      section: sectionName,
      campusId,
      isActive: true,
    },
    select: { id: true, name: true, section: true, batchId: true, shift: true, campusId: true, grade: true, academicYear: true },
  })
  if (cls) return cls

  // 5. Try matching inactive classes
  cls = await prisma.class.findFirst({
    where: {
      grade,
      section: sectionName,
      campusId,
    },
    select: { id: true, name: true, section: true, batchId: true, shift: true, campusId: true, grade: true, academicYear: true },
  })
  return cls
}

export async function findOrCreateLegacySubject(resolvedClassId: string, subjectId: string) {
  // 1. Direct check: is this already a valid legacy Subject ID?
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true, code: true, classId: true }
  })
  if (subject) return subject

  // 2. Try resolving via AcademicSubject code
  const academicSubject = await prisma.academicSubject.findUnique({
    where: { id: subjectId },
    select: { code: true, name: true },
  })

  if (academicSubject) {
    // Try code-based lookup on active legacy subjects
    let mapped = await prisma.subject.findFirst({
      where: { classId: resolvedClassId, code: academicSubject.code, isActive: true },
      select: { id: true, name: true, code: true, classId: true },
    })
    if (mapped) return mapped

    // Try name-based lookup on active legacy subjects
    mapped = await prisma.subject.findFirst({
      where: { classId: resolvedClassId, name: academicSubject.name, isActive: true },
      select: { id: true, name: true, code: true, classId: true },
    })
    if (mapped) return mapped

    // Try code-based lookup on any legacy subjects (active or inactive)
    mapped = await prisma.subject.findFirst({
      where: { classId: resolvedClassId, code: academicSubject.code },
      select: { id: true, name: true, code: true, classId: true },
    })
    if (mapped) return mapped

    // Try name-based lookup on any legacy subjects
    mapped = await prisma.subject.findFirst({
      where: { classId: resolvedClassId, name: academicSubject.name },
      select: { id: true, name: true, code: true, classId: true },
    })
    if (mapped) return mapped

    // 3. Fallback: If not found by any fallback, create the legacy Subject dynamically
    const createdLegacySubject = await prisma.subject.upsert({
      where: {
        code_classId: {
          code: academicSubject.code,
          classId: resolvedClassId,
        }
      },
      update: {},
      create: {
        name: academicSubject.name,
        code: academicSubject.code,
        classId: resolvedClassId,
        totalMarks: 100,
        passingMarks: 33,
        isElective: false,
        isActive: true,
      },
      select: { id: true, name: true, code: true, classId: true }
    })
    return createdLegacySubject
  }

  return null
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

  const shiftCode = (classSection.shift?.code ?? classSection.shift?.name ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/SHIFT$/, '')

  const mappedLegacyClass = await findLegacyClassForSection({
    grade: classSection.grade,
    sectionName: classSection.sectionName,
    campusId: classSection.campusId,
    batchId: classSection.batchId,
    shiftCode,
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
    let legacySubjectId: string | null = null
    let academicSubjectId: string | null = null

    // 1. Try to treat subjectId as a legacy Subject ID
    const legacySub = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, code: true },
    })

    if (legacySub) {
      legacySubjectId = legacySub.id
      const acadSub = await prisma.academicSubject.findFirst({
        where: { code: legacySub.code },
        select: { id: true },
      })
      academicSubjectId = acadSub?.id ?? null
    } else {
      // 2. Try to treat subjectId as an AcademicSubject ID
      const acadSub = await prisma.academicSubject.findUnique({
        where: { id: subjectId },
        select: { id: true, code: true },
      })
      if (acadSub) {
        academicSubjectId = acadSub.id
        if (context.legacyClassId) {
          const legacySubFromCode = await prisma.subject.findFirst({
            where: { classId: context.legacyClassId, code: acadSub.code },
            select: { id: true },
          })
          legacySubjectId = legacySubFromCode?.id ?? null
        }
      }
    }

    if (context.legacyClassId && legacySubjectId) {
      const directSubjectTeacher = await prisma.subjectTeacher.findFirst({
        where: {
          teacherId,
          subjectId: legacySubjectId,
          subject: { classId: context.legacyClassId },
        },
      })
      if (directSubjectTeacher) return true
    }

    if (context.classSectionId && academicSubjectId) {
      const sectionSubjectTeacher = await prisma.subjectOffering.findFirst({
        where: {
          teacherId,
          classSectionId: context.classSectionId,
          subjectId: academicSubjectId,
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
