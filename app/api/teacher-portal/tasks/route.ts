import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { findLegacyClassForSection, findOrCreateLegacySubject, resolveClassContext } from '@/lib/teacher-access'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { sessionShiftSchema, type SessionShift } from '@/lib/validation/shift'
import { isSchemaOutOfDateError } from '@/lib/db-errors'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  type: z.enum(['ASSIGNMENT', 'QUIZ', 'CP', 'MID_TERM', 'FINAL_TERM', 'OTHER']),
  dueDate: z.string().nullable().optional(),
  maxMarks: z.coerce.number().min(1).default(100),
  classId: z.string(),
  classSectionId: z.string().nullable().optional(),
  legacyClassId: z.string().nullable().optional(),
  subjectId: z.string(),
})

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  classId: z.string().optional(),
  subjectId: z.string().optional(),
})

async function teacherCanCreateTaskForSubject(params: {
  teacherId: string
  legacyClassId: string
  classSectionId: string | null
  subjectId: string
  academicYearName?: string | null
}) {
  // 1. Direct SubjectOffering check by classSectionId + subjectId
  if (params.classSectionId) {
    const offering = await prisma.subjectOffering.findFirst({
      where: {
        teacherId: params.teacherId,
        classSectionId: params.classSectionId,
        OR: [
          { subjectId: params.subjectId },
          { id: params.subjectId },
        ],
      },
      select: { id: true },
    })
    if (offering) return true

  }

  // 2. Direct SubjectTeacher check by legacyClassId + subjectId
  const directSubject = await prisma.subjectTeacher.findFirst({
    where: {
      teacherId: params.teacherId,
      subjectId: params.subjectId,
      subject: { classId: params.legacyClassId },
    },
    select: { id: true },
  })
  if (directSubject) return true

  // 3. Match by academic subject code or legacy subject code
  const academicSubject = await prisma.academicSubject.findUnique({
    where: { id: params.subjectId },
    select: { id: true, code: true, name: true },
  })
  if (academicSubject) {
    const mappedLegacySubject = await prisma.subject.findFirst({
      where: {
        classId: params.legacyClassId,
        // MySQL Prisma clients do not support Prisma's `mode` string filter.
        // The production collation is case-insensitive; explicit variants
        // below also keep this lookup portable across existing records.
        OR: [
          { code: academicSubject.code },
          { code: academicSubject.code.toLowerCase() },
          { code: academicSubject.code.toUpperCase() },
          { name: academicSubject.name },
        ],
      },
      select: { id: true },
    })

    if (mappedLegacySubject) {
      const mappedSubjectAssignment = await prisma.subjectTeacher.findFirst({
        where: {
          teacherId: params.teacherId,
          subjectId: mappedLegacySubject.id,
        },
        select: { id: true },
      })
      if (mappedSubjectAssignment) return true
    }
  }

  // 4. Legacy Subject lookup (if subjectId is a legacy Subject ID)
  const legacySub = await prisma.subject.findUnique({
    where: { id: params.subjectId },
    select: { code: true, name: true },
  })
  if (legacySub) {
    const acadSub = await prisma.academicSubject.findFirst({
      where: {
        // Keep this compatible with the MySQL Prisma client (no `mode` filter).
        OR: [
          { code: legacySub.code },
          { code: legacySub.code.toLowerCase() },
          { code: legacySub.code.toUpperCase() },
          { name: legacySub.name },
        ]
      },
      select: { id: true },
    })
    if (acadSub && params.classSectionId) {
      const offering = await prisma.subjectOffering.findFirst({
        where: {
          teacherId: params.teacherId,
          classSectionId: params.classSectionId,
          subjectId: acadSub.id,
        },
        select: { id: true },
      })
      if (offering) return true
    }
  }

  // 5. Class Teacher check
  const classTeacher = await prisma.classTeacher.findFirst({
    where: {
      teacherId: params.teacherId,
      classId: params.legacyClassId,
      isClassTeacher: true,
      ...(params.academicYearName ? { academicYear: params.academicYearName } : {}),
    },
    select: { id: true },
  })
  if (classTeacher) return true

  // 6. TimetableSlot fallback
  if (params.classSectionId) {
    const slot = await prisma.timetableSlot.findFirst({
      where: {
        teacherId: params.teacherId,
        classSectionId: params.classSectionId,
        OR: [
          { subjectOfferingId: params.subjectId },
          { subjectOffering: { subjectId: params.subjectId } },
        ],
      },
      select: { id: true },
    })
    if (slot) return true
  }

  // Do not fall back to an offering in another section. A teacher may teach
  // the same subject elsewhere, but that must never authorize task creation
  // for this section without a section-specific assignment.
  return false
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) return errors.validation(parsed.error)
    const { page, limit, classId, subjectId } = parsed.data

    const where = {
      teacherId: teacher.id,
      ...(classId ? { OR: [{ classId }, { classSectionId: classId }] } : {}),
      ...(subjectId && { subjectId }),
    }

    const [total, tasks] = await prisma.$transaction([
      prisma.classTask.count({ where }),
      prisma.classTask.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          class: { select: { name: true, section: true } },
          classSection: { select: { id: true, className: true, sectionName: true, shift: { select: { code: true, name: true } } } },
          subject: { select: { name: true, code: true } }
        }
      }),
    ])

    return paginatedResponse(tasks, { page, limit, total })
  } catch (err) {
    console.error('[TEACHER_TASK_LIST]', err)
    if (isSchemaOutOfDateError(err)) {
      return errors.schemaOutOfDate('The task database schema is out of date. Please run the production schema sync and try again.')
    }
    return errors.internal()
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { title, description, type, dueDate, maxMarks, classId, classSectionId, legacyClassId, subjectId } = parsed.data

  try {
    const context = await resolveClassContext(classId)
    let resolvedClassId = legacyClassId ?? context.legacyClassId
    let resolvedClassSectionId = classSectionId ?? context.classSectionId

    if (!resolvedClassId) {
      const section = await prisma.classSection.findUnique({
        where: { id: classId },
        select: {
          id: true,
          grade: true,
          className: true,
          sectionName: true,
          campusId: true,
          batchId: true,
          shift: { select: { code: true, name: true } },
        },
      })

      if (section) {
        resolvedClassSectionId = section.id
        const rawShift = (section.shift?.code ?? section.shift?.name ?? '')
          .toUpperCase()
          .replace(/\s+/g, '')
          .replace(/SHIFT$/, '')
        const shiftParseResult = sessionShiftSchema.safeParse(rawShift)
        const legacyShift: SessionShift = shiftParseResult.success
          ? shiftParseResult.data
          : 'MORNING'

        // Extract bare section letter from names like "Morning (A)" → "A"
        const rawSectionName = section.sectionName ?? ''
        const sectionLetterMatch = rawSectionName.match(/\(([^)]+)\)/)
        const normalizedSection = sectionLetterMatch
          ? sectionLetterMatch[1].trim()
          : rawSectionName.trim()

        const legacyClass = await findLegacyClassForSection({
          grade: section.grade,
          sectionName: rawSectionName,
          campusId: section.campusId,
          batchId: section.batchId,
          shiftCode: rawShift,
        })

        if (legacyClass) {
          resolvedClassId = legacyClass.id
        } else {
          // Dynamically create/upsert the legacy Class record for this new engine ClassSection
          const activeYear = await getActiveAcademicYear()
          const academicYearName = activeYear?.name ?? '2024-2025'
          const gradeVal = section.grade ?? 0

          try {
            const newLegacyClass = await prisma.class.upsert({
              where: {
                grade_section_campusId_academicYear_shift: {
                  grade: gradeVal,
                  section: normalizedSection,
                  campusId: section.campusId,
                  academicYear: academicYearName,
                  shift: legacyShift,
                }
              },
              update: {},
              create: {
                name: `${section.className ?? `Class ${gradeVal}`} - ${rawShift} (${normalizedSection})`,
                grade: gradeVal,
                section: normalizedSection,
                campusId: section.campusId,
                batchId: section.batchId,
                academicYear: academicYearName,
                shift: legacyShift,
                isActive: true,
              },
              select: { id: true }
            })
            resolvedClassId = newLegacyClass.id
          } catch {
            // If upsert failed due to constraint race, attempt a plain findFirst
            const existingCls = await prisma.class.findFirst({
              where: {
                grade: gradeVal,
                section: normalizedSection,
                campusId: section.campusId,
                shift: legacyShift,
                isActive: true,
              },
              select: { id: true }
            })
            if (existingCls) {
              resolvedClassId = existingCls.id
            }
            // If still null, continue — the final guard below will catch it
          }
        }
      }
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    if (!resolvedClassId) {
      return errors.validation({ errors: [{ path: ['classId'], message: 'Class could not be resolved for this teacher assignment' }] } as never)
    }

    const isSuperOrAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)
    const activeYear = await getActiveAcademicYear()
    const isAssigned = isSuperOrAdmin || await teacherCanCreateTaskForSubject({
      teacherId: teacher.id,
      legacyClassId: resolvedClassId,
      classSectionId: resolvedClassSectionId,
      subjectId,
      academicYearName: activeYear?.name,
    })

    if (!isAssigned) {
      return errors.forbidden('You are not authorized to create tasks for this class/subject')
    }

    const legacySubject = await findOrCreateLegacySubject(resolvedClassId, subjectId)
    const resolvedSubjectId = legacySubject?.id ?? null

    if (!resolvedSubjectId) {
      return errors.validation({ errors: [{ path: ['subjectId'], message: 'Subject could not be resolved for this teacher assignment' }] } as never)
    }

    const task = await prisma.classTask.create({
      data: {
        title,
        description,
        type,
        dueDate: dueDate ? new Date(dueDate) : null,
        maxMarks,
        classId: resolvedClassId,
        classSectionId: resolvedClassSectionId,
        subjectId: resolvedSubjectId,
        teacherId: teacher.id,
      },
      include: {
        class: { select: { name: true, section: true } },
        classSection: { select: { id: true, className: true, sectionName: true, shift: { select: { code: true, name: true } } } },
        subject: { select: { name: true, code: true } }
      }
    })

    return createdResponse(task, 'Task created successfully')
  } catch (err) {
    console.error('[TEACHER_TASK_CREATE]', err)
    if (isSchemaOutOfDateError(err)) {
      return errors.schemaOutOfDate('The task database schema is out of date. Please run the production schema sync and try again.')
    }
    return errors.internal()
  }
}
