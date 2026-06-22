import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { studentLeaveReviewSchema } from '@/lib/validation/teacher'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can review leave requests')

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher')

  const leaveRequest = await prisma.studentLeaveRequest.findUnique({
    where: { id },
    include: {
      student: { select: { userId: true, firstName: true, lastName: true } },
    },
  })
  if (!leaveRequest) return errors.notFound('Leave request')
  if (leaveRequest.teacherId !== teacher.id) {
    return errors.forbidden('You are not authorized to review this leave request')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = studentLeaveReviewSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { status, remarks } = parsed.data

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRequest = await tx.studentLeaveRequest.update({
      where: { id },
      data: { status, remarks },
    })

    // Create Notification for the student
    await tx.notification.create({
      data: {
        userId: leaveRequest.student.userId,
        title: `Leave Request ${status.toLowerCase()}`,
        message: `Your leave request for ${new Date(leaveRequest.startDate).toLocaleDateString()} to ${new Date(leaveRequest.endDate).toLocaleDateString()} has been ${status.toLowerCase()}. ${remarks ? `Remarks: ${remarks}` : ''}`,
        type: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        relatedId: id,
      },
    })

    return updatedRequest
  })

  // Add to AuditLog
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'StudentLeaveRequest',
      entityId: id,
      changes: { status, remarks },
    },
  })

  return successResponse(updated, `Leave request has been ${status.toLowerCase()}`)
}
