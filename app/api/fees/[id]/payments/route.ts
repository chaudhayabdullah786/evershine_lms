/**
 * POST /api/fees/[id]/payments — record a payment against an invoice
 *
 * WHY $transaction: Updates FeeInvoice.paidAmount and Student.paidAmount
 * atomically. A partial write would leave the invoice and student summary
 * out of sync, corrupting financial reports.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'

const paymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Online', 'Cheque']),
  transactionId: z.string().optional(),
  remarks: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const parsed = paymentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { amount, paymentMethod, transactionId, remarks } = parsed.data

  // Fetch invoice with current state
  const invoice = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    include: { student: { select: { id: true, paidAmount: true, dueAmount: true } } },
  })

  if (!invoice) return errors.notFound('Fee invoice')
  if (invoice.status === 'CANCELLED') {
    return errors.conflict('Cannot record payment against a cancelled invoice')
  }
  if (invoice.status === 'PAID') {
    return errors.conflict('Invoice is already fully paid')
  }

  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount)
  if (amount > remaining) {
    return errors.validation({
      errors: [{
        path: ['amount'],
        message: `Amount Rs ${amount} exceeds remaining balance Rs ${remaining}`,
      }],
    } as never)
  }

  const newPaidAmount = Number(invoice.paidAmount) + amount
  const newStatus = newPaidAmount >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID'

  const payment = await prisma.$transaction(async (tx) => {
    // 1. Create payment record
    const newPayment = await tx.feePayment.create({
      data: {
        invoiceId,
        studentId: invoice.studentId,
        amount,
        paymentMethod,
        transactionId: transactionId ?? null,
        status: 'COMPLETED',
        receivedBy: session.user.id,
        remarks: remarks ?? null,
      },
    })

    // 2. Update invoice paid amount + status
    await tx.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus,
      },
    })

    // 3. Update student's denormalized fee summary without allowing negative dues.
    const remainingStudentDue = Math.max(0, Number(invoice.student.dueAmount) - amount)
    await tx.student.update({
      where: { id: invoice.studentId },
      data: {
        paidAmount: { increment: amount },
        dueAmount: remainingStudentDue,
        feeStatus: newStatus === 'PAID' && remainingStudentDue <= 0 ? 'PAID' : 'PARTIALLY_PAID',
      },
    })

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'FeePayment',
        entityId: newPayment.id,
        changes: { invoiceId, amount, paymentMethod, newStatus },
      },
    })

    return newPayment
  })

  return createdResponse(
    { id: payment.id, invoiceId, amount, newStatus },
    `Payment of Rs ${amount} recorded successfully`
  )
}
