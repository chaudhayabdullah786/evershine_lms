import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit-logger'
import { errors, successResponse } from '@/lib/api-response'
import { z, ZodError, ZodIssueCode } from 'zod'
import type { Role } from '@prisma/client'

const resolveComplaintSchema = z.object({
  remarks: z.string().min(2).max(1000),
})

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return errors.forbidden()
  }

  const complaintId = params.id
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
  })

  if (!complaint) return errors.notFound('Complaint')

  if (complaint.status === 'RESOLVED') {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: ['status'], message: 'This complaint is already resolved.' }]))
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation(new ZodError([{ code: ZodIssueCode.custom, path: [], message: 'Invalid JSON' }]))
  }

  const parsed = resolveComplaintSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { remarks } = parsed.data
  const resolverName = session.user.name ?? session.user.email ?? 'Administration'

  // Atomic: update complaint + notify complainant
  const [updatedComplaint] = await prisma.$transaction(async (tx) => {
    const updated = await tx.complaint.update({
      where: { id: complaintId },
      data: {
        status: 'RESOLVED',
        remarks,
        resolvedBy: session.user.id,
      },
    })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Complaint',
      entityId: complaintId,
      changes: {
        status: 'RESOLVED',
        remarks,
        resolvedBy: session.user.id,
      },
      request,
    })

    // Dispatch a professional in-app notification to the complainant
    await tx.notification.create({
      data: {
        userId: complaint.complainantId,
        title: '✅ Your Complaint Has Been Resolved',
        message: `Your complaint titled "${complaint.title}" has been reviewed and resolved by ${resolverName}. Administrative response: "${remarks}"`,
        type: 'COMPLAINT_RESOLVED',
        relatedId: complaintId,
        isRead: false,
      },
    })

    return [updated]
  })

  return successResponse(updatedComplaint, {
    message: 'Complaint resolved and complainant notified.',
  })
}

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    return errors.forbidden()
  }

  const complaintId = params.id
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
  })

  if (!complaint) return errors.notFound('Complaint')

  // Delete complaint and notify complainant
  await prisma.$transaction(async (tx) => {
    await tx.complaint.delete({ where: { id: complaintId } })

    await logAudit({
      prismaClient: tx,
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'Complaint',
      entityId: complaintId,
      changes: {
        reason: 'administrative delete',
      },
      request: _request,
    })

    await tx.notification.create({
      data: {
        userId: complaint.complainantId,
        title: 'Complaint Record Administratively Removed',
        message: `Your complaint titled "${complaint.title}" has been administratively closed and removed from the registry. For further queries, please contact the administration directly.`,
        type: 'INFO',
        relatedId: complaintId,
        isRead: false,
      },
    })
  })

  return successResponse({ id: complaintId }, { message: 'Complaint deleted and complainant notified.' })
}
