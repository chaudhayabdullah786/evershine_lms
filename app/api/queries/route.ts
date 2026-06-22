import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit-logger'
import { errors, createdResponse, successResponse, paginatedResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const createQuerySchema = z.object({
  teacherId: z.string(),
  subject: z.string().min(2).max(100),
  queryText: z.string().min(5).max(2000),
})

const queryParamSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  getTeachers: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = queryParamSchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit, getTeachers } = parsed.data

  const userRole = session.user.role as Role

  // Helper to load teachers for student queries form
  if (getTeachers === 'true') {
    const teachersList = await prisma.teacher.findMany({
      where: { isActive: true },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        specialization: true,
      },
    })
    return successResponse(teachersList)
  }

  let where: any = {}

  if (userRole === 'STUDENT') {
    where = { studentId: session.user.id }
  } else if (userRole === 'TEACHER') {
    where = { teacherId: session.user.id }
  } else if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    // Admins see all queries for moderation/audit
    where = {}
  } else {
    return errors.forbidden()
  }

  const [total, studentQueries] = await prisma.$transaction([
    prisma.studentQuery.count({ where }),
    prisma.studentQuery.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return paginatedResponse(studentQueries, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  if (userRole !== 'STUDENT') {
    return errorResponse('STUDENT_ONLY', 'Only students can submit academic queries', 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as any)
  }

  const parsed = createQuerySchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { teacherId, subject, queryText } = parsed.data

  // Fetch teacher details
  const teacherUser = await prisma.user.findUnique({
    where: { id: teacherId },
    include: { teacher: true },
  })

  if (!teacherUser || teacherUser.role !== 'TEACHER' || !teacherUser.teacher) {
    return errors.notFound('Selected Teacher')
  }

  const teacherName = `${teacherUser.teacher.firstName} ${teacherUser.teacher.lastName}`

  const studentQuery = await prisma.$transaction(async (tx) => {
    const createdQuery = await tx.studentQuery.create({
      data: {
        studentId: session.user.id,
        studentName: session.user.name ?? session.user.email ?? 'Student',
        teacherId,
        teacherName,
        subject,
        queryText,
        status: 'PENDING',
      },
    })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'StudentQuery',
      entityId: createdQuery.id,
      changes: {
        teacherId,
        teacherName,
        subject,
        queryText,
        status: 'PENDING',
      },
      request,
    })

    return createdQuery
  })

  return createdResponse(studentQuery, 'Query submitted successfully to ' + teacherName)
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  )
}
