/**
 * GET  /api/exams
 * POST /api/exams
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const createExamSchema = z.object({
  name: z.string().min(2),
  classIds: z.array(z.string().min(1)).min(1),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  totalMarks: z.number().int().min(10).default(100),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'exams', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const classId = searchParams.get('classId')
  const academicYear = searchParams.get('academicYear')

  const scopedCampusId = (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') ? session.user.campusId : undefined

  let scopedClassId = undefined
  if (session.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: session.user.id }, select: { classId: true } })
    if (student?.classId) scopedClassId = student.classId
  }

  const where = {
    ...(classId && { classId }),
    ...(academicYear && { academicYear }),
    ...(session.user.role === 'STUDENT' 
      ? (scopedClassId ? { classId: scopedClassId } : { id: 'no-match' }) 
      : (scopedCampusId ? { class: { campusId: scopedCampusId } } : {})),
    isActive: true,
  }

  const exams = await prisma.exam.findMany({
    where,
    orderBy: { startDate: 'desc' },
    include: {
      class: { select: { name: true, campusId: true, grade: true, section: true } },
      _count: { select: { results: true } },
    },
  })

  return successResponse(exams)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'exams', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createExamSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  const classes = await prisma.class.findMany({ 
    where: { id: { in: data.classIds } }, 
    select: { id: true, campusId: true } 
  })
  
  if (classes.length !== data.classIds.length) return errors.notFound('One or more classes not found')

  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    const invalidClass = classes.find(c => c.campusId !== session.user.campusId)
    if (invalidClass) {
      return errors.forbidden()
    }
  }

  const createdExams = await prisma.$transaction(async (tx) => {
    const exams = []
    for (const cls of classes) {
      const examData = {
        name: data.name,
        academicYear: data.academicYear,
        startDate: data.startDate,
        endDate: data.endDate,
        totalMarks: data.totalMarks,
        classId: cls.id,
      }
      const newExam = await tx.exam.create({ data: examData })
      exams.push(newExam)

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'Exam',
          entityId: newExam.id,
          changes: examData,
        },
      })
    }
    return exams
  })

  return createdResponse(createdExams, `${createdExams.length} exam(s) scheduled successfully`)
}