import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role, InvoiceStatus } from '@prisma/client'

const verifyProofSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  remarks: z.string().max(500).optional(),
  /** Optional: exact amount student paid (for partial approval). Defaults to full remaining balance. */
  paidAmount: z.number().positive('Paid amount must be greater than zero').optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'fees', 'update')) return errors.forbidden()

  const { id: invoiceId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = verifyProofSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { action, remarks, paidAmount } = parsed.data

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    select: { 
      id: true, 
      challanNumber: true,
      studentId: true, 
      status: true,
      proofStatus: true,
      totalAmount: true,
      paidAmount: true,
      proofRemarks: true,
      student: { select: { userId: true } },
    },
  })

  if (!invoice) return errors.notFound('Fee invoice')
  if (invoice.proofStatus !== 'PENDING') return errors.conflict('Invoice does not have a pending proof')
  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return errors.conflict('Invoice is already paid or cancelled')

  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount)

  const updatedInvoice = await prisma.$transaction(async (tx) => {
    if (action === 'APPROVE') {
      // Use provided paidAmount or default to full remaining balance
      const amountToPay = paidAmount ? Math.min(paidAmount, remaining) : remaining
      const newPaidTotal = Number(invoice.paidAmount) + amountToPay
      const newInvoiceStatus: InvoiceStatus = newPaidTotal >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID'

      // Create payment record
      const payment = await tx.feePayment.create({
        data: {
          invoiceId,
          studentId: invoice.studentId,
          amount: amountToPay,
          paymentMethod: 'Bank Transfer',
          transactionId: 'MANUAL_PROOF',
          status: 'COMPLETED',
          receivedBy: session.user.id,
          remarks: remarks ?? 'Approved from uploaded proof',
        },
      })

      // Update invoice
      const res = await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: { increment: amountToPay },
          status: newInvoiceStatus,
          proofStatus: 'APPROVED',
          proofRemarks: remarks ? `Admin: ${remarks}` : invoice.proofRemarks,
          // Clear proof fields if partially paid so student can re-upload for remaining
          ...(newInvoiceStatus === 'PARTIALLY_PAID' && {
            proofUrl: null, proofRemarks: null, proofUploadedAt: null,
          }),
        },
      })

      // Update student totals
      await tx.student.update({
        where: { id: invoice.studentId },
        data: {
          paidAmount: { increment: amountToPay },
          dueAmount: { decrement: amountToPay },
          feeStatus: newInvoiceStatus,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'FeeInvoice',
          entityId: invoiceId,
          changes: { proofStatus: 'APPROVED', paymentId: payment.id, amountApproved: amountToPay, newStatus: newInvoiceStatus },
        },
      })

      // Notify student
      await tx.notification.create({
        data: {
          userId: invoice.student.userId,
          title: newInvoiceStatus === 'PAID' ? 'Fee Payment Approved — Fully Paid' : 'Fee Payment Approved — Partial',
          message: newInvoiceStatus === 'PAID'
            ? `Your payment proof for Challan #${invoice.challanNumber || invoiceId} has been verified. Your fee is now fully paid.`
            : `Your payment of PKR ${amountToPay.toLocaleString()} for Challan #${invoice.challanNumber || invoiceId} has been verified. Remaining: PKR ${(remaining - amountToPay).toLocaleString()}.`,
          type: 'FEE_UPDATE',
          relatedId: invoiceId,
        }
      })

      return res
    } else {
      // Reject
      const res = await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: {
          proofStatus: 'REJECTED',
          proofRemarks: remarks ? `Admin Rejection: ${remarks}` : invoice.proofRemarks,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'FeeInvoice',
          entityId: invoiceId,
          changes: { proofStatus: 'REJECTED' },
        },
      })

      // Notify student
      await tx.notification.create({
        data: {
          userId: invoice.student.userId,
          title: 'Fee Payment Rejected',
          message: `Your payment proof for Challan #${invoice.challanNumber || invoiceId} was rejected. ${remarks ? `Reason: ${remarks}` : 'Please contact the accounts office.'}`,
          type: 'FEE_UPDATE',
          relatedId: invoiceId,
        }
      })

      return res
    }
  })

  return successResponse(updatedInvoice, { message: `Payment proof ${action.toLowerCase()}d successfully` })
}
