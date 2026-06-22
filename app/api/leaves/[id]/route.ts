import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit-logger'
import { errors, successResponse } from '@/lib/api-response'
import { z, ZodError, ZodIssueCode } from 'zod'
import type { Role } from '@prisma/client'

const reviewLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  remarks: z.string().max(500).optional(),
})

const REVIEWER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: params.id },
  })

  if (!leave) return errors.notFound('Leave request')

  const userRole = session.user.role as Role
  const isAdmin = REVIEWER_ROLES.includes(userRole)
  const isOwner = leave.applicantId === session.user.id

  if (!isAdmin && !isOwner) return errors.forbidden()

  return successResponse(leave)
}

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role

  if (!REVIEWER_ROLES.includes(userRole)) {
    return errors.forbidden()
  }

  const userId = session.user.id
  const userName = session.user.name ?? session.user.email ?? 'Administration'
  const leaveId = params.id

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
  })

  if (!leave) return errors.notFound('Leave request')

  if (leave.status !== 'PENDING') {
    return errors.validation(new ZodError([
      { code: ZodIssueCode.custom, path: ['status'], message: 'This leave request has already been reviewed.' },
    ]))
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation(new ZodError([
      { code: ZodIssueCode.custom, path: [], message: 'Invalid JSON body' },
    ]))
  }

  const parsed = reviewLeaveSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { status, remarks } = parsed.data
  const isApproved = status === 'APPROVED'
  // EMERGENCY/SICK leaves bypass penalty logic per admin configuration
  const isExemptLeaveType = leave.leaveType === 'EMERGENCY' || leave.leaveType === 'SICK'

  const [updatedLeave] = await prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status,
        remarks: remarks ?? null,
        reviewedBy: userId,
        reviewedName: userName,
      },
    })

    // ─── Penalty Logic (only on APPROVED non-exempt leaves) ────────────────
    if (isApproved && !isExemptLeaveType) {
      const currentMonth = new Date().getMonth() + 1
      const currentYear = new Date().getFullYear()
      const monthStart = new Date(currentYear, currentMonth - 1, 1)
      const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)

      if (leave.applicantRole === 'STUDENT') {
        // Look up the student and their active fee policy
        const student = await tx.student.findFirst({
          where: { userId: leave.applicantId },
          include: {
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { classSection: { include: { batch: true } } },
            },
          },
        })

        if (student && student.enrollments.length > 0) {
          const enrollment = student.enrollments[0]
          const feePolicy = await tx.feePolicy.findFirst({
            where: {
              isActive: true,
              OR: [
                { batchId: enrollment.classSection.batchId },
                { campusId: enrollment.classSection.campusId },
                { batchId: null, campusId: null },
              ],
            },
            orderBy: { createdAt: 'desc' },
          })

          if (feePolicy && feePolicy.allowedLeavesPerMonth > 0) {
            // Count approved non-exempt student leaves this month
            const approvedThisMonth = await tx.leaveRequest.count({
              where: {
                applicantId: leave.applicantId,
                applicantRole: 'STUDENT',
                status: 'APPROVED',
                leaveType: { notIn: ['EMERGENCY', 'SICK'] },
                startDate: { gte: monthStart, lte: monthEnd },
              },
            })

            // +1 for the leave we are currently approving
            const totalAfterApproval = approvedThisMonth + 1

            if (totalAfterApproval > feePolicy.allowedLeavesPerMonth) {
              // Exceeded limit — apply penalty charge to the next open fee invoice
              const penaltyAmount = Number(feePolicy.leavePenaltyAmount)
              if (penaltyAmount > 0) {
                const openInvoice = await tx.feeInvoice.findFirst({
                  where: {
                    studentId: student.id,
                    status: { in: ['PENDING', 'PARTIALLY_PAID'] },
                  },
                  orderBy: { dueDate: 'asc' },
                })

                if (openInvoice) {
                  await tx.feeInvoice.update({
                    where: { id: openInvoice.id },
                    data: {
                      // Increment total amount by penalty
                      amount: { increment: penaltyAmount },
                    },
                  })
                }

                // Notify student of the penalty
                await tx.notification.create({
                  data: {
                    userId: leave.applicantId,
                    title: '⚠️ Leave Penalty Applied',
                    message: `A leave penalty of Rs ${penaltyAmount.toLocaleString()} has been added to your fee invoice because you exceeded your monthly leave allowance (${feePolicy.allowedLeavesPerMonth} leave(s)/month). This was leave #${totalAfterApproval} this month. Contact Admin if this is incorrect.`,
                    type: 'FEE_REMINDER',
                    relatedId: leaveId,
                    isRead: false,
                  },
                })
              }
            }
          }
        }
      } else if (leave.applicantRole === 'TEACHER') {
        // Look up teacher penalty policy
        const teacher = await tx.teacher.findFirst({
          where: { userId: leave.applicantId },
        })

        if (teacher) {
          const teacherPolicy = await tx.teacherPenaltyPolicy.findFirst({
            where: {
              isActive: true,
              OR: [
                { campusId: teacher.campusId ?? undefined },
                { campusId: null },
              ],
            },
            orderBy: { createdAt: 'desc' },
          })

          if (teacherPolicy && teacherPolicy.allowedLeavesPerMonth > 0) {
            const approvedThisMonth = await tx.leaveRequest.count({
              where: {
                applicantId: leave.applicantId,
                applicantRole: 'TEACHER',
                status: 'APPROVED',
                leaveType: { notIn: ['EMERGENCY', 'SICK'] },
                startDate: { gte: monthStart, lte: monthEnd },
              },
            })

            const totalAfterApproval = approvedThisMonth + 1

            if (totalAfterApproval > teacherPolicy.allowedLeavesPerMonth) {
              const penaltyAmount = Number(teacherPolicy.leavePenaltyAmount)
              if (penaltyAmount > 0) {
                // For teachers, record penalty on salary slip or HR record via notification
                await tx.notification.create({
                  data: {
                    userId: leave.applicantId,
                    title: '⚠️ Leave Penalty — Salary Deduction Notice',
                    message: `A leave deduction of Rs ${penaltyAmount.toLocaleString()} will be applied to your salary this month. You have used ${totalAfterApproval} leave(s), exceeding the allowed limit of ${teacherPolicy.allowedLeavesPerMonth}/month. Contact HR if this is in error.`,
                    type: 'INFO',
                    relatedId: leaveId,
                    isRead: false,
                  },
                })
              }
            }
          }
        }
      }
    }
    // ─── End Penalty Logic ─────────────────────────────────────────────────

    // Standard approval/rejection notification
    const leaveTypeFriendly = leave.leaveType.charAt(0) + leave.leaveType.slice(1).toLowerCase()
    const startFormatted = new Date(leave.startDate).toLocaleDateString('en-PK', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    const endFormatted = new Date(leave.endDate).toLocaleDateString('en-PK', {
      year: 'numeric', month: 'long', day: 'numeric',
    })

    const notifTitle = isApproved ? `✅ Leave Request Approved` : `❌ Leave Request Rejected`
    const notifMessage = isApproved
      ? `Your ${leaveTypeFriendly} Leave request from ${startFormatted} to ${endFormatted} has been approved by ${userName}.${remarks ? ` Remarks: "${remarks}"` : ''}`
      : `Your ${leaveTypeFriendly} Leave request from ${startFormatted} to ${endFormatted} has been rejected by ${userName}.${remarks ? ` Reason: "${remarks}"` : ' Please reapply with updated details if necessary.'}`

    await tx.notification.create({
      data: {
        userId: leave.applicantId,
        title: notifTitle,
        message: notifMessage,
        type: isApproved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        relatedId: leaveId,
        isRead: false,
      },
    })

    await logAudit({
      prismaClient: tx,
      userId,
      action: isApproved ? 'APPROVE' : 'REJECT',
      entityType: 'LeaveRequest',
      entityId: leaveId,
      changes: {
        status,
        reviewedBy: userId,
        reviewedName: userName,
        remarks: remarks ?? null,
      },
      request,
    })

    return [updated]
  })

  return successResponse(updatedLeave, {
    message: `Leave request ${status.toLowerCase()} and applicant notified.`,
  })
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  const userId = session.user.id
  const leaveId = params.id

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
  })

  if (!leave) return errors.notFound('Leave request')

  if (REVIEWER_ROLES.includes(userRole)) {
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.delete({ where: { id: leaveId } })
      await tx.notification.create({
        data: {
          userId: leave.applicantId,
          title: 'Leave Request Removed by Administration',
          message: `Your ${leave.leaveType.toLowerCase()} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} was administratively removed. Please contact HR for clarification.`,
          type: 'INFO',
          relatedId: leaveId,
        },
      })
      await logAudit({
        prismaClient: tx,
        userId,
        action: 'DELETE',
        entityType: 'LeaveRequest',
        entityId: leaveId,
        changes: {
          reason: leave.reason,
          status: leave.status,
          deletedByRole: userRole,
        },
        request,
      })
    })
  } else if (leave.applicantId === userId) {
    if (leave.status !== 'PENDING') {
      return errors.forbidden()
    }
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.delete({ where: { id: leaveId } })
      await logAudit({
        prismaClient: tx,
        userId,
        action: 'DELETE',
        entityType: 'LeaveRequest',
        entityId: leaveId,
        changes: {
          reason: leave.reason,
          status: leave.status,
          deletedByRole: leave.applicantRole,
        },
        request,
      })
    })
  } else {
    return errors.forbidden()
  }

  return successResponse({ id: leaveId }, { message: 'Leave request deleted successfully.' })
}
