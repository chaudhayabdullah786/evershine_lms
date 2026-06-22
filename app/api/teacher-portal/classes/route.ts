/**
 * GET /api/teacher-portal/classes
 *
 * Returns classes assigned to the requesting teacher, deduped.
 * A teacher is "assigned" to a class if they are the ClassTeacher OR
 * a SubjectTeacher for any subject in that class.
 *
 * WHY separate from /api/classes: The global endpoint returns all classes
 * and includes student lists. Teachers must only see their own assignment set.
 *
 * Schema traversal note:
 *   SubjectTeacher has no direct classId — classId lives on Subject.
 *   We must include subject → class to extract classId correctly.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { sessionShiftSchema } from '@/lib/validation/shift'

const normalizeShiftValue = (value?: string | null) => {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, '') ?? ''
  return normalized.endsWith('SHIFT') ? normalized.slice(0, -'SHIFT'.length) : normalized
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const allowedRoles = ['TEACHER', 'SUPER_ADMIN', 'ADMIN']
  if (!allowedRoles.includes(session.user.role)) return errors.forbidden('Only teachers can access this')

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  // Non-teacher roles (admin previewing the portal) have no Teacher record — return empty list gracefully
  if (!teacher) return successResponse([])

  const activeYear = await getActiveAcademicYear()
  const activeYearName = activeYear?.name ?? null

  const { searchParams } = new URL(req.url)
  const shiftParam = searchParams.get('shift')
  const shiftFilter = shiftParam ? sessionShiftSchema.safeParse(shiftParam) : null
  if (shiftParam && shiftFilter && !shiftFilter.success) {
    return errors.validation(shiftFilter.error)
  }

  // ── Fetch ClassTeacher assignments ─────────────────────────────────────────
  const classTeacherRows = await prisma.classTeacher.findMany({
    where: {
      teacherId: teacher.id,
      ...(activeYearName ? { academicYear: activeYearName } : {}),
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          section: true,
          grade: true,
          shift: true,
          batchId: true,
          campusId: true,
          academicYear: true,
          campus: { select: { name: true, code: true } },
          batch:  { select: { name: true, code: true, academicLevel: true } },
        },
      },
    },
  })

  // ── Fetch SubjectTeacher assignments (via subject → class) ─────────────────
  // WHY: SubjectTeacher.classId doesn't exist — traverse subject.classId
  const subjectTeacherRows = await prisma.subjectTeacher.findMany({
    where: { teacherId: teacher.id },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          classId: true,
          class: {
            select: {
              id: true,
              name: true,
              section: true,
              grade: true,
              shift: true,
              batchId: true,
              campusId: true,
              academicYear: true,
              campus: { select: { name: true, code: true } },
              batch:  { select: { name: true, code: true, academicLevel: true } },
            },
          },
        },
      },
    },
  })

  // ── Fetch published timetable assignments (New Academic Engine) ───────────
  const timetableRows = await prisma.timetableSlot.findMany({
    where: {
      teacherId: teacher.id,
      isPublished: true,
      ...(activeYear?.id ? { academicYearId: activeYear.id } : {}),
    },
    include: {
      classSection: {
        select: {
          id: true,
          className: true,
          sectionName: true,
          grade: true,
          shiftId: true,
          batchId: true,
          campusId: true,
          shift: { select: { name: true, code: true } },
          campus: { select: { name: true, code: true } },
          batch:  { select: { name: true, code: true, academicLevel: true } },
        },
      },
      subjectOffering: { select: { id: true, subjectId: true, subject: { select: { id: true, name: true, code: true } } } },
    },
  })

  // ── Fetch SubjectOffering assignments (New Academic Engine) ─────────────────
  const subjectOfferingRows = await prisma.subjectOffering.findMany({
    where: {
      teacherId: teacher.id,
      ...(activeYear?.id ? { academicYearId: activeYear.id } : {}),
    },
    include: {
      subject: {
        select: { id: true, name: true, code: true },
      },
      classSection: {
        select: {
          id: true,
          className: true,
          sectionName: true,
          grade: true,
          shiftId: true,
          batchId: true,
          campusId: true,
          shift: { select: { name: true } },
          campus: { select: { name: true, code: true } },
          batch:  { select: { name: true, code: true, academicLevel: true } },
        },
      },
    },
  })

  // ── Deduplicate by classId ─────────────────────────────────────────────────
  // Use a composite key to ensure unique classes: "{grade}_{section}_{campusId}_{batchId}_{shift}"
  // This prevents duplicates when the same class exists in both legacy and new systems
  const createClassKey = (grade: number, section: string, campusId: string, batchId: string | null, shift: string) => 
    `${grade}|${section}|${campusId}|${batchId || 'null'}|${shift}`.toLowerCase()

  const classMap = new Map<string, {
    id: string
    name: string
    section: string
    grade: number
    shift: string
    classSectionId?: string | null
    legacyClassId?: string | null
    batchId: string
    campusId: string
    campus: { name: string; code: string }
    batch: { name: string; code: string; academicYear?: string }
    isClassTeacher: boolean
    isSubjectTeacher: boolean
    subjects: { id: string; name: string; code: string }[]
  }>()

  // Class teacher rows (Legacy system)
  classTeacherRows.forEach((row) => {
    const cls = (row as any).class
    if (activeYearName && cls?.academicYear && cls.academicYear !== activeYearName) return
    const shiftCode = normalizeShiftValue(cls.shift ?? '')
    const key = createClassKey(cls.grade ?? 0, cls.section ?? '', cls.campusId, cls.batchId, shiftCode)
    
    if (!classMap.has(key)) {
      classMap.set(key, {
        ...cls,
        classSectionId: null,
        legacyClassId: cls.id,
        isClassTeacher: row.isClassTeacher,
        isSubjectTeacher: false,
        subjects: [],
      })
    }
  })

  // Subject teacher rows (Legacy system) — merge into map
  subjectTeacherRows.forEach((row) => {
    const subject = (row as any).subject
    const cls = subject.class
    if (activeYearName && cls?.academicYear && cls.academicYear !== activeYearName) return
    const shiftCode = normalizeShiftValue(cls.shift ?? '')
    const key = createClassKey(cls.grade ?? 0, cls.section ?? '', cls.campusId, cls.batchId, shiftCode)
    
    if (classMap.has(key)) {
      const entry = classMap.get(key)!
      entry.isSubjectTeacher = true
      if (!entry.subjects.find((s: any) => s.id === subject.id)) {
        entry.subjects.push({ id: subject.id, name: subject.name, code: subject.code })
      }
    } else {
      classMap.set(key, {
        ...cls,
        classSectionId: null,
        legacyClassId: cls.id,
        isClassTeacher: false,
        isSubjectTeacher: true,
        subjects: [{ id: subject.id, name: subject.name, code: subject.code }],
      })
    }
  })

  // Timetable rows (New Academic Engine) — merge into map with composite key
  for (const row of timetableRows) {
    const cls = row.classSection
    if (!cls) continue

    const shiftCode = normalizeShiftValue(cls.shift?.code ?? cls.shift?.name)
    const key = createClassKey(cls.grade ?? 0, cls.sectionName ?? '', cls.campusId, cls.batchId, shiftCode)

    // Try to find the legacy class for this section (if it exists)
    const legacyClass = await prisma.class.findFirst({
      where: {
        grade: cls.grade ?? 0,
        section: cls.sectionName,
        campusId: cls.campusId,
        batchId: cls.batchId,
        shift: shiftCode as any,
        ...(activeYearName ? { academicYear: activeYearName } : {}),
        isActive: true,
      },
      select: { id: true, name: true, section: true },
    })

    if (classMap.has(key)) {
      // Class already exists in map — just add the subject
      const entry = classMap.get(key)!
      entry.isSubjectTeacher = true
      if (row.subjectOffering?.subject && !entry.subjects.find((s: any) => s.id === row.subjectOffering.subject.id)) {
        entry.subjects.push({ 
          id: row.subjectOffering.subject.id, 
          name: row.subjectOffering.subject.name, 
          code: row.subjectOffering.subject.code 
        })
      }
    } else {
      // New class — add to map with composite key
      classMap.set(key, {
        id: legacyClass?.id ?? cls.id,
        name: legacyClass?.name ?? cls.className,
        section: legacyClass?.section ?? cls.sectionName,
        classSectionId: cls.id,
        legacyClassId: legacyClass?.id ?? null,
        grade: cls.grade ?? 0,
        shift: shiftCode || 'Unknown',
        batchId: cls.batchId,
        campusId: cls.campusId,
        campus: cls.campus,
        batch: cls.batch as any,
        isClassTeacher: false,
        isSubjectTeacher: true,
        subjects: row.subjectOffering?.subject ? [{ 
          id: row.subjectOffering.subject.id, 
          name: row.subjectOffering.subject.name, 
          code: row.subjectOffering.subject.code 
        }] : [],
      })
    }
  }

  // Subject offering rows (New Academic Engine) — merge into map with composite key
  for (const row of subjectOfferingRows) {
    const subject = row.subject
    const cls = row.classSection
    if (!cls) continue

    const shiftCode = normalizeShiftValue(cls.shift?.name ?? cls.shift?.code)
    const key = createClassKey(cls.grade ?? 0, cls.sectionName ?? '', cls.campusId, cls.batchId, shiftCode)

    // Try to find the legacy class for this section (if it exists)
    const legacyClass = await prisma.class.findFirst({
      where: {
        grade: cls.grade ?? 0,
        section: cls.sectionName,
        campusId: cls.campusId,
        batchId: cls.batchId,
        shift: shiftCode as any,
        ...(activeYearName ? { academicYear: activeYearName } : {}),
        isActive: true,
      },
      select: { id: true, name: true, section: true },
    })

    if (classMap.has(key)) {
      // Class already exists in map — just add the subject
      const entry = classMap.get(key)!
      entry.isSubjectTeacher = true
      if (!entry.subjects.find((s: any) => s.id === subject.id)) {
        entry.subjects.push({ id: subject.id, name: subject.name, code: subject.code })
      }
    } else {
      // New class — add to map with composite key
      classMap.set(key, {
        id: legacyClass?.id ?? cls.id,
        name: legacyClass?.name ?? cls.className,
        section: legacyClass?.section ?? cls.sectionName,
        classSectionId: cls.id,
        legacyClassId: legacyClass?.id ?? null,
        grade: cls.grade ?? 0,
        shift: shiftCode || 'Unknown',
        batchId: cls.batchId,
        campusId: cls.campusId,
        campus: cls.campus,
        batch: cls.batch as any,
        isClassTeacher: false,
        isSubjectTeacher: true,
        subjects: [{ id: subject.id, name: subject.name, code: subject.code }],
      })
    }
  }

  let classes = Array.from(classMap.values())
  if (shiftFilter?.success) {
    classes = classes.filter((c) => c.shift === shiftFilter.data)
  }

  return successResponse(classes)
}
