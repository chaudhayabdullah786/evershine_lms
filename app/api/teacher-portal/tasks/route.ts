import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { teacherCanAccessClassOrSubject } from '@/lib/teacher-access'
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
    ...(classId && { classId }),
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

  const { title, description, type, dueDate, maxMarks, classId, legacyClassId, subjectId } = parsed.data

  let resolvedClassId = legacyClassId ?? (await prisma.class.findUnique({ where: { id: classId }, select: { id: true } }))?.id ?? null

  if (!resolvedClassId) {
    const section = await prisma.classSection.findUnique({
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

    if (section) {
      const shiftCode = (section.shift?.code ?? section.shift?.name ?? '').toUpperCase().replace(/\s+/g, '')
      const mappedClass = await prisma.class.findFirst({
        where: {
          grade: section.grade ?? 0,
          section: section.sectionName ?? '',
          campusId: section.campusId,
          batchId: section.batchId ?? null,
          shift: shiftCode as never,
          isActive: true,
        },
        select: { id: true },
      })

      resolvedClassId = mappedClass?.id ?? null
    }
  }

  // Resolve subject ID: try direct lookup first, then fallback to code-based lookup
  let resolvedSubjectId: string = subjectId
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  })

  if (subject) {
    resolvedSubjectId = subject.id
  } else {
    // Subject not found by ID — try to find by code in the resolved class
    const academicSubject = await prisma.academicSubject.findUnique({
      where: { id: subjectId },
      select: { code: true },
    })

    if (academicSubject?.code && resolvedClassId) {
      const mapped = await prisma.subject.findFirst({
        where: { classId: resolvedClassId, code: academicSubject.code, isActive: true },
        select: { id: true },
      })
      if (mapped) {
        resolvedSubjectId = mapped.id
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

  const isAssigned = await teacherCanAccessClassOrSubject(teacher.id, resolvedClassId, resolvedSubjectId)

  if (!isAssigned) {
    return errors.forbidden('You are not authorized to create tasks for this class/subject')
  }

  const task = await prisma.classTask.create({
    data: {
      title,
      description,
      type,
      dueDate: dueDate ? new Date(dueDate) : null,
      maxMarks,
      classId: resolvedClassId,
      subjectId: resolvedSubjectId,
      teacherId: teacher.id,
    },
    include: {
      class: { select: { name: true, section: true } },
      subject: { select: { name: true } }
    }
  })

  return createdResponse(task, 'Task created successfully')
}
