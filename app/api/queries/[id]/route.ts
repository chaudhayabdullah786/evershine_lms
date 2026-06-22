import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit-logger'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const answerQuerySchema = z.object({
  response: z.string().min(2).max(2000),
})

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  if (userRole !== 'TEACHER' && userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return errors.forbidden() // Only teacher or admin can answer
  }

  const queryId = params.id
  const studentQuery = await prisma.studentQuery.findUnique({
    where: { id: queryId },
  })

  if (!studentQuery) return errors.notFound('Student Query')

  // Validation: Only the designated teacher can answer (Admins can also moderate/answer)
  if (userRole === 'TEACHER' && studentQuery.teacherId !== session.user.id) {
    return errors.forbidden()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as any)
  }

  const parsed = answerQuerySchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { response } = parsed.data

  const updatedQuery = await prisma.$transaction(async (tx) => {
    const updated = await tx.studentQuery.update({
      where: { id: queryId },
      data: {
        status: 'ANSWERED',
        response,
      },
    })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'ANSWER',
      entityType: 'StudentQuery',
      entityId: queryId,
      changes: {
        status: 'ANSWERED',
        response,
      },
      request,
    })

    return updated
  })

  return successResponse(updatedQuery, { message: 'Query answered successfully' })
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  const queryId = params.id

  const studentQuery = await prisma.studentQuery.findUnique({
    where: { id: queryId },
  })

  if (!studentQuery) return errors.notFound('Student Query')

  // Validation: Owner student can delete pending, Admin can delete any
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    // Admin delete
  } else if (studentQuery.studentId === session.user.id) {
    if (studentQuery.status !== 'PENDING') {
      return errors.forbidden()
    }
  } else {
    return errors.forbidden()
  }

  await prisma.$transaction(async (tx) => {
    await tx.studentQuery.delete({ where: { id: queryId } })
    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'StudentQuery',
      entityId: queryId,
      changes: {
        status: studentQuery.status,
        deletedByRole: userRole,
      },
      request,
    })
  })

  return successResponse({ id: queryId }, { message: 'Query deleted successfully' })
}
