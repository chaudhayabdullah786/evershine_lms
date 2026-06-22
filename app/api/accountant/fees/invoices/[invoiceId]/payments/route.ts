/**
 * POST /api/accountant/fees/invoices/[invoiceId]/payments
 * Records a manual payment against an invoice.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { recordPaymentSchema } from '@/lib/validation/accountant-fee'

export async function POST(
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

  const parsed = recordPaymentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  const existing = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, studentId: true, totalAmount: true, paidAmount: true, status: true, student: { select: { campusId: true, dueAmount: true } } },
  })

  if (!existing) return errors.notFound('Invoice not found')
  if (existing.status === 'PAID') return errors.conflict('Invoice is already fully paid')
  if (existing.status === 'CANCELLED') return errors.conflict('Cannot pay a cancelled invoice')

  if (role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: session.user.id },
      select: { campusId: true },
    })
    if (existing.student.campusId !== acc?.campusId) {
      return errors.forbidden('Cannot record payment for a student in a different campus')
    }
  }

  // Prevent overpayment
  const amountToPay = data.amount
  const currentPaid = Number(existing.paidAmount)
  const total = Number(existing.totalAmount)
  
  if (currentPaid + amountToPay > total) {
    return errors.conflict(`Payment amount exceeds remaining balance of ${total - currentPaid}`)
  }

  const newStatus = (currentPaid + amountToPay >= total) ? 'PAID' : 'PARTIALLY_PAID'

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.feePayment.create({
      data: {
        invoiceId,
        amount: amountToPay,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        paymentMethod: data.paymentMethod,
        transactionId: data.transactionId,
        remarks: data.remarks,
        recordedBy: session.user.id,
      },
    })

    // Update invoice
    await tx.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: { increment: amountToPay },
        status: newStatus,
      },
    })

    // Update student totals
    await tx.student.update({
      where: { id: existing.studentId },
      data: {
        paidAmount: { increment: amountToPay },
        dueAmount: { decrement: amountToPay },
        feeStatus: newStatus === 'PAID' && (Number(existing.student.dueAmount) - amountToPay <= 0) ? 'PAID' : 'UNPAID',
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'FeePayment',
        entityId: p.id,
        changes: { amount: amountToPay, invoiceId, newStatus },
      },
    })

    return p
  })

  return createdResponse(payment, 'Payment recorded successfully')
}
