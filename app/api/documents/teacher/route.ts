/**
 * POST /api/documents/teacher
 * Records a generated teacher document (ID card, experience letter, profile)
 * into the TeacherDocument audit table.
 *
 * Access: SUPER_ADMIN | ADMIN
 * WHY separate endpoint: TeacherDocument is a different model from Certificate
 * (student-only). Mixing them in POST /api/documents would require a breaking
 * change to that route's validation schema.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { checkPermission } from '@/lib/rbac'
import type { Role } from '@prisma/client'

const createTeacherDocSchema = z.object({
  teacherId: z.string().cuid('Invalid teacher ID'),
  type: z.enum([
    'TEACHER_ID_CARD',
    'TEACHER_EXPERIENCE_LETTER',
    'TEACHER_PROFILE',
  ]),
  title: z.string().min(2, 'Title is required').trim(),
  // WHY: pdfUrl is a placeholder in dev; Cloudinary URL in production.
  // Non-blocking: if upload fails the PDF was still delivered to the admin.
  pdfUrl: z.string().default('https://evershaheen.edu/documents/placeholder.pdf'),
  remarks: z.string().trim().optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'documents', 'create')) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = createTeacherDocSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { teacherId, type, title, pdfUrl, remarks } = parsed.data

  // Verify the teacher exists before writing the audit record
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, campusId: true },
  })
  if (!teacher) return errors.notFound('Teacher not found')

  // ADMIN is campus-scoped: prevent cross-campus document generation
  if (
    session.user.role === 'ADMIN' &&
    session.user.campusId &&
    teacher.campusId !== session.user.campusId
  ) {
    return errors.forbidden()
  }

  const doc = await prisma.teacherDocument.create({
    data: {
      teacherId,
      type,
      title,
      pdfUrl,
      issuedBy: session.user.id,
      remarks,
    },
    select: { id: true, type: true, createdAt: true },
  })

  // Non-blocking audit log for compliance trail
  try {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'TeacherDocument',
        entityId: doc.id,
        changes: { type, teacherId, title },
      },
    })
  } catch {
    // Audit log failure must never block the primary response
  }

  return createdResponse(doc, `Teacher document (${type}) recorded successfully`)
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'documents', 'read')) {
    return errors.forbidden()
  }

  const { searchParams } = new URL(request.url)
  const teacherId = searchParams.get('teacherId')
  const type = searchParams.get('type')
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')))

  const where = {
    ...(teacherId && { teacherId }),
    ...(type && { type: type as never }),
  }

  const [total, docs] = await prisma.$transaction([
    prisma.teacherDocument.count({ where }),
    prisma.teacherDocument.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        pdfUrl: true,
        remarks: true,
        createdAt: true,
        teacher: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
    }),
  ])

  return paginatedResponse(docs, { page, limit, total })
}
