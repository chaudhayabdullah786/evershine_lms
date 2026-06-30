/**
 * GET /api/results — paginated results list, filtered by examId or studentId
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, paginatedResponse } from '@/lib/api-response'
import { teacherCanAccessClassOrSubject } from '@/lib/teacher-access'
import { mapGradeLetter } from '@/lib/academic/grades'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const querySchema = z.object({
  examId: z.string().optional(),
  studentId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'results', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { examId, studentId, page, limit } = parsed.data

  const where: Record<string, unknown> = {}
  if (examId) where.examId = examId
  if (studentId) where.studentId = studentId

  // Students can only see their own results
  if (session.user.role === 'STUDENT') {
    const own = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!own) return paginatedResponse([], { page, limit, total: 0 })
    where.studentId = own.id
  }

  const [total, results] = await prisma.$transaction([
    prisma.result.count({ where }),
    prisma.result.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, registrationNumber: true } },
        exam: { select: { id: true, name: true, totalMarks: true } },
        details: {
          include: { subject: { select: { name: true } } },
        },
      },
    }),
  ])

  // Flatten result details for the UI — one row per subject detail
  const flattened = results.flatMap((r) =>
    r.details.length > 0
      ? r.details.map((d) => ({
          id: `${r.id}-${d.id}`,
          student: r.student,
          exam: r.exam,
          subject: d.subject,
          totalMarks: d.totalMarks,
          obtainedMarks: d.obtainedMarks,
          percentage: (d.obtainedMarks / d.totalMarks) * 100,
          grade: d.grade,
          status: d.isPassed ? 'PASS' : 'FAIL',
        }))
      : [{
          id: r.id,
          student: r.student,
          exam: r.exam,
          subject: { name: 'Overall' },
          totalMarks: r.totalMarks,
          obtainedMarks: r.obtainedMarks,
          percentage: Number(r.percentage),
          grade: r.grade,
          status: r.isPassed ? 'PASS' : 'FAIL',
        }]
  )

  return paginatedResponse(flattened, { page, limit, total })
}

/**
 * POST /api/results — bulk enter results for an exam
 * Accepts an array of { studentId, obtainedMarks, totalMarks, remarks? }
 * Grade and isPassed are computed server-side to prevent client manipulation.
 */

const resultItemSchema = z.object({
  studentId: z.string().min(1),
  obtainedMarks: z.number().int().min(0),
  totalMarks: z.number().int().min(1),
  remarks: z.string().max(300).optional(),
})

const bulkCreateSchema = z.object({
  examId: z.string().min(1),
  results: z.array(resultItemSchema).min(1).max(200),
})

function computeGrade(pct: number): string {
  return mapGradeLetter(pct)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'results', 'create')) return errors.forbidden()
  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }
  const parsed = bulkCreateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { examId, results } = parsed.data

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, name: true, classId: true }
  })
  if (!exam) return errors.notFound('Exam')

  // Resolve teacher and check permissions if role is TEACHER.
  // Legacy per-teacher grading schemas are removed in favor of institution-wide grading rules.
  let teacherId: string | undefined = undefined

  if (session.user.role === 'TEACHER') {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    })
    if (!teacher) return errors.notFound('Teacher profile not found')
    teacherId = teacher.id

    const isAssigned = await teacherCanAccessClassOrSubject(teacherId, exam.classId)
    if (!isAssigned) {
      return errors.forbidden('You are not authorized to enter results for this class')
    }
  }

  // Validate no out-of-range marks
  for (const r of results) {
    if (r.obtainedMarks > r.totalMarks) {
      return errors.validation({
        errors: [{ path: ['obtainedMarks'], message: `Student ${r.studentId}: obtained marks exceed total marks` }],
      } as never)
    }
  }

  // Load student user IDs to send notifications
  const dbStudents = await prisma.student.findMany({
    where: { id: { in: results.map(r => r.studentId) } },
    select: { id: true, userId: true }
  })
  const studentUserMap = new Map(dbStudents.map(s => [s.id, s.userId]))

  const created = await prisma.$transaction(async (tx) => {
    const entries = await Promise.all(
      results.map(async (r) => {
        const pct = (r.obtainedMarks / r.totalMarks) * 100
        const grade = computeGrade(pct)
        const res = await tx.result.upsert({
          where: { studentId_examId: { studentId: r.studentId, examId } },
          create: {
            studentId: r.studentId,
            examId,
            obtainedMarks: r.obtainedMarks,
            totalMarks: r.totalMarks,
            percentage: pct,
            grade,
            isPassed: pct >= 40,
            remarks: r.remarks ?? null,
          },
          update: {
            obtainedMarks: r.obtainedMarks,
            totalMarks: r.totalMarks,
            percentage: pct,
            grade,
            isPassed: pct >= 40,
            remarks: r.remarks ?? null,
          },
        })

        // Notify relative student
        const studentUserId = studentUserMap.get(r.studentId)
        if (studentUserId) {
          await tx.notification.create({
            data: {
              userId: studentUserId,
              title: 'Exam Results Published',
              message: `Your results for exam "${exam.name}" are published. Score: ${r.obtainedMarks}/${r.totalMarks} (${pct.toFixed(1)}%, Grade: ${grade}).`,
              type: 'RESULT_PUBLISHED',
              relatedId: examId,
            }
          })
        }

        return res
      })
    )

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Result',
        entityId: examId,
        changes: { examId, count: results.length },
      },
    })

    return entries
  })

  const { successResponse: sr } = await import('@/lib/api-response')
  return sr(created, `${created.length} results saved for exam ${exam.name}`)
}

