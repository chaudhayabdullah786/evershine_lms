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
  classSectionId: string | null
  subjectId: string
  academicYearId: string | null
}) {
  if (!params.classSectionId || !params.academicYearId) return false

  const assignment = await prisma.teacherSectionAssignment.findUnique({
    where: {
      teacherId_classSectionId_academicYearId: {
        teacherId: params.teacherId,
        classSectionId: params.classSectionId,
        academicYearId: params.academicYearId,
      },
    },
    select: { isClassTeacher: true, status: true },
  })
  if (!assignment || assignment.status !== 'ACTIVE') return false
  if (assignment.isClassTeacher) return true

  // Subject teachers may create a task only for an offering owned by them in
  // this exact active-year section. SubjectOffering and the canonical section
  // assignment are both required; timetable or legacy rows never grant access.
  const offering = await prisma.subjectOffering.findFirst({
    where: {
      academicYearId: params.academicYearId,
      teacherId: params.teacherId,
      classSectionId: params.classSectionId,
      OR: [{ subjectId: params.subjectId }, { id: params.subjectId }],
    },
    select: { id: true },
  })
  return Boolean(offering)
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
      classSectionId: resolvedClassSectionId,
      subjectId,
      academicYearId: activeYear?.id ?? null,
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
