/**
 * PATCH /api/accountant/fees/invoices/[invoiceId]/proof
 * Accountant action on a guardian-uploaded payment proof (APPROVE or REJECT).
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { proofActionSchema } from '@/lib/validation/accountant-fee'
import { dispatchNotification } from '@/lib/notifications/in-app'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden()
  }

  const { invoiceId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = proofActionSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { action, remarks, paidAmount } = parsed.data

  const existing = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    select: { 
      id: true, 
      studentId: true, 
      challanNumber: true,
      status: true, 
      proofStatus: true,
      totalAmount: true,
      paidAmount: true,
      student: { select: { campusId: true, dueAmount: true, userId: true } } 
    },
  })

  if (!existing) return errors.notFound('Invoice not found')
  if (existing.proofStatus !== 'PENDING') return errors.conflict('There is no pending proof to action')
  if (existing.status === 'PAID') return errors.conflict('Invoice is already fully paid')
  if (existing.status === 'CANCELLED') return errors.conflict('Cannot approve proof for a cancelled invoice')

  if (role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: session.user.id },
      select: { campusId: true },
    })
    if (existing.student.campusId !== acc?.campusId) {
      return errors.forbidden('Cannot action proof for a student in a different campus')
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (action === 'APPROVE') {
      const remaining = Number(existing.totalAmount) - Number(existing.paidAmount)
      // Use accountant-specified amount or default to full remaining balance
      const amountToPay = paidAmount ? Math.min(paidAmount, remaining) : remaining
      const newPaidTotal = Number(existing.paidAmount) + amountToPay
      const newInvoiceStatus = newPaidTotal >= Number(existing.totalAmount) ? 'PAID' : 'PARTIALLY_PAID'

      const p = await tx.feePayment.create({
        data: {
          invoiceId,
          studentId: existing.studentId,
          amount: amountToPay,
          paymentDate: new Date(),
          paymentMethod: 'Bank Transfer',
          remarks: remarks ?? 'Approved from proof',
          receivedBy: session.user.id,
        },
      })

      await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: { increment: amountToPay },
          status: newInvoiceStatus,
          proofStatus: 'APPROVED',
          // Clear proof so student can re-upload for remaining balance if partially paid
          ...(newInvoiceStatus === 'PARTIALLY_PAID' && { proofUrl: null, proofRemarks: null, proofUploadedAt: null }),
        },
      })

      const remainingStudentDue = Math.max(0, Number(existing.student.dueAmount) - amountToPay)
      await tx.student.update({
        where: { id: existing.studentId },
        data: {
          paidAmount: { increment: amountToPay },
          dueAmount: remainingStudentDue,
          feeStatus: newInvoiceStatus === 'PAID' && remainingStudentDue <= 0 ? 'PAID' : 'PARTIALLY_PAID',
        },
      })

      // Notify student directly
      await tx.notification.create({
        data: {
          userId: existing.student.userId,
          title: newInvoiceStatus === 'PAID' ? 'Fee Payment Approved — Fully Paid' : 'Fee Payment Approved — Partial',
          message: newInvoiceStatus === 'PAID'
            ? `Your payment proof for Challan #${existing.challanNumber} has been verified. Your fee is now fully paid.`
            : `Your payment of PKR ${amountToPay.toLocaleString()} for Challan #${existing.challanNumber} has been verified. Remaining balance: PKR ${(remaining - amountToPay).toLocaleString()}.`,
          type: 'FEE_UPDATE',
          relatedId: invoiceId,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'FeeInvoice',
          entityId: invoiceId,
          changes: { proofStatus: 'APPROVED', paymentId: p.id, amountApproved: amountToPay, newStatus: newInvoiceStatus },
        },
      })
      return { status: 'APPROVED', newInvoiceStatus, amountToPay }
    } else {
      // REJECT
      await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: {
          proofStatus: 'REJECTED',
          proofRemarks: remarks ? `Rejected: ${remarks}` : 'Rejected',
        },
      })

      // Notify student directly
      await tx.notification.create({
        data: {
          userId: existing.student.userId,
          title: 'Payment Proof Rejected',
          message: `Your payment proof for Challan #${existing.challanNumber} was rejected.${remarks ? ` Reason: ${remarks}` : ' Please contact the accounts office.'}`,
          type: 'FEE_UPDATE',
          relatedId: invoiceId,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'FeeInvoice',
          entityId: invoiceId,
          changes: { proofStatus: 'REJECTED', remarks },
        },
      })
      return { status: 'REJECTED' }
    }
  })

  // Notify guardians via fire-and-forget notification engine
  if (result.status === 'APPROVED') {
    dispatchNotification({
      type: 'PROOF_APPROVED',
      invoiceId,
      studentId: existing.studentId,
    })
  } else {
    dispatchNotification({
      type: 'PROOF_REJECTED',
      invoiceId,
      studentId: existing.studentId,
      reason: remarks ?? 'Invalid or unreadable proof',
    })
  }

  return successResponse(null, `Payment proof ${result.status.toLowerCase()} successfully`)
}
