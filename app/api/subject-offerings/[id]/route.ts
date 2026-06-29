import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { updateSubjectOfferingSchema } from '@/lib/validation/academic'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  
  const denied = requirePermission(session.user.role as Role, 'subject_offerings', 'update')
  if (denied) return denied

  const { id } = await params
  
  const existing = await prisma.subjectOffering.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Subject Offering')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateSubjectOfferingSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.subjectOffering.update({
      where: { id },
      data: parsed.data,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'SubjectOffering',
        entityId: id,
        changes: parsed.data,
      },
    })

    return res
  })

  return successResponse(updated, 'Subject offering updated successfully')
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  
  const denied = requirePermission(session.user.role as Role, 'subject_offerings', 'delete')
  if (denied) return denied

  const { id } = await params
  
  const existing = await prisma.subjectOffering.findUnique({ where: { id } })
  if (!existing) return errors.notFound('Subject Offering')

  await prisma.$transaction(async (tx) => {
    // Delete related timetable slots and enrollments safely
    await tx.timetableSlot.deleteMany({ where: { subjectOfferingId: id } })
    await tx.subjectEnrollment.deleteMany({ where: { subjectOfferingId: id } })
    
    await tx.subjectOffering.delete({ where: { id } })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'SubjectOffering',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Subject offering deleted successfully')
}
