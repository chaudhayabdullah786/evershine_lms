import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { findLegacyClassForSection, findOrCreateLegacySubject } from '@/lib/teacher-access'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { sessionShiftSchema, type SessionShift } from '@/lib/validation/shift'
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
}) {
  if (params.classSectionId) {
    const offering = await prisma.subjectOffering.findFirst({
      where: {
        teacherId: params.teacherId,
        classSectionId: params.classSectionId,
        subjectId: params.subjectId,
      },
      select: { id: true },
    })
    if (offering) return true
  }

  const directSubject = await prisma.subjectTeacher.findFirst({
    where: {
      teacherId: params.teacherId,
      subjectId: params.subjectId,
      subject: { classId: params.legacyClassId },
    },
    select: { id: true },
  })
  if (directSubject) return true

  const academicSubject = await prisma.academicSubject.findUnique({
    where: { id: params.subjectId },
    select: { code: true },
  })
  if (academicSubject) {
    const mappedLegacySubject = await prisma.subject.findFirst({
      where: {
        classId: params.legacyClassId,
        code: academicSubject.code,
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

  const classTeacher = await prisma.classTeacher.findFirst({
    where: {
      teacherId: params.teacherId,
      classId: params.legacyClassId,
    },
    select: { id: true },
  })

  return Boolean(classTeacher)
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

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

  let resolvedClassSectionId = classSectionId ?? null
  let resolvedClassId = legacyClassId ?? (await prisma.class.findUnique({ where: { id: classId }, select: { id: true } }))?.id ?? null

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
      const shiftCode = (section.shift?.code ?? section.shift?.name ?? '')
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/SHIFT$/, '')
      const legacyShift: SessionShift = sessionShiftSchema.safeParse(shiftCode).success
        ? (shiftCode as SessionShift)
        : 'MORNING'

      const legacyClass = await findLegacyClassForSection({
        grade: section.grade,
        sectionName: section.sectionName,
        campusId: section.campusId,
        batchId: section.batchId,
        shiftCode,
      })

      if (legacyClass) {
        resolvedClassId = legacyClass.id
      } else {
        // Dynamically create/upsert the legacy Class record for this new engine ClassSection
        const activeYear = await getActiveAcademicYear()
        const academicYearName = activeYear?.name ?? '2024-2025'

        const newLegacyClass = await prisma.class.upsert({
          where: {
            grade_section_campusId_academicYear_shift: {
              grade: section.grade ?? 0,
              section: section.sectionName ?? '',
              campusId: section.campusId,
              academicYear: academicYearName,
              shift: legacyShift,
            }
          },
          update: {},
          create: {
            name: `${section.className ?? `Class ${section.grade}`} - ${shiftCode} (${section.sectionName ?? 'A'})`,
            grade: section.grade ?? 0,
            section: section.sectionName ?? '',
            campusId: section.campusId,
            batchId: section.batchId,
            academicYear: academicYearName,
            shift: legacyShift,
            isActive: true,
          },
          select: { id: true }
        })
        resolvedClassId = newLegacyClass.id
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

  const isAssigned = await teacherCanCreateTaskForSubject({
    teacherId: teacher.id,
    legacyClassId: resolvedClassId,
    classSectionId: resolvedClassSectionId,
    subjectId,
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
}
