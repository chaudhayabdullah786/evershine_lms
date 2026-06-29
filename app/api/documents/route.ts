/**
 * GET /api/documents
 * Used to fetch the document records for a student
 *
 * POST /api/documents
 * Used to record a newly generated document/certificate into the database.
 * The actual PDF generation and Cloudinary upload happens on the client,
 * then this endpoint is called to link the Cloudinary URL to the student.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, successResponse } from '@/lib/api-response'
import type { Prisma, Role } from '@prisma/client'
import { z } from 'zod'

const createDocumentSchema = z.object({
  studentId: z.string().cuid(),
  type: z.enum(['BONAFIDE', 'ACHIEVEMENT', 'COMPLETION', 'BIRTHDAY', 'PERFORMANCE', 'ID_CARD', 'RESULT_CARD']),
  title: z.string().min(2),
  pdfUrl: z.string().url(),
  remarks: z.string().optional(),
})

async function assertStudentDocumentAccess(sessionUser: { id: string; role: string }, studentId: string) {
  if (sessionUser.role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: sessionUser.id },
      select: { id: true },
    })
    if (!student || student.id !== studentId) {
      return false
    }
    return true
  }

  if (sessionUser.role === 'GUARDIAN' || sessionUser.role === 'PARENT') {
    const guardian = await prisma.guardian.findUnique({
      where: { userId: sessionUser.id },
      select: {
        students: {
          where: { id: studentId },
          select: { id: true },
        },
      },
    })

    return !!guardian && guardian.students.length > 0
  }

  return true
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'documents', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('studentId')

  if (!studentId) return errors.validation({ errors: [{ path: ['studentId'], message: 'studentId is required' }] } as never)

  const canAccess = await assertStudentDocumentAccess(session.user, studentId)
  if (!canAccess) return errors.forbidden('You are not authorised to access these documents.')

  const documents = await prisma.certificate.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  })

  return successResponse(documents)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'documents', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createDocumentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  const student = await prisma.student.findUnique({ where: { id: data.studentId }, select: { id: true } })
  if (!student) return errors.notFound('Student')

  const doc = await prisma.$transaction(async (tx) => {
    const newDoc = await tx.certificate.create({
      data: {
        studentId: data.studentId!,
        type: data.type!,
        title: data.title!,
        pdfUrl: data.pdfUrl!,
        remarks: data.remarks,
        issuedBy: session.user.id,
      } satisfies Prisma.CertificateUncheckedCreateInput,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Certificate',
        entityId: newDoc.id,
        changes: data,
      },
    })

    return newDoc
  })

  return createdResponse(doc, 'Document record saved successfully')
}
