/**
 * POST /api/fees/[id]/pay — record a payment against a fee invoice
 *
 * WHY $transaction with three writes:
 *   1. Create FeePayment record (the receipt)
 *   2. Update FeeInvoice.paidAmount and status
 *   3. Update Student.feeStatus (denormalized cache for dashboard queries)
 *   4. Audit log
 *
 * If any step fails, all four roll back — no phantom payments, no
 * mismatched ledger entries.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse } from '@/lib/api-response'
import { recordPaymentSchema } from '@/lib/validation/fee'
import type { Role, InvoiceStatus, FeeStatus } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'fees', 'create')) return errors.forbidden()

  const { id: invoiceId } = await params

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = recordPaymentSchema.safeParse({ ...(body as any), invoiceId })
  if (!parsed.success) return errors.validation(parsed.error)

  const { amount, paymentMethod, transactionId, paymentDate, remarks } = parsed.data

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      studentId: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
    },
  })

  if (!invoice) return errors.notFound('Fee Invoice')
  if (invoice.status === 'CANCELLED') {
    return errors.conflict('Cannot record payment on a cancelled invoice')
  }
  if (invoice.status === 'PAID') {
    return errors.conflict('This invoice is already fully paid')
  }

  const currentPaid = Number(invoice.paidAmount)
  const total = Number(invoice.totalAmount)
  const newPaid = currentPaid + amount

  if (newPaid > total) {
    return errors.validation({
      errors: [{
        path: ['amount'],
        message: `Payment amount (${amount}) exceeds outstanding balance (${(total - currentPaid).toFixed(2)})`,
      }],
    } as never)
  }

  // Determine new invoice status
  const newInvoiceStatus: InvoiceStatus = newPaid >= total ? 'PAID' : 'PARTIALLY_PAID'

  // Determine new student fee status
  const newFeeStatus: FeeStatus = newPaid >= total ? 'PAID' : 'PARTIALLY_PAID'

  const payment = await prisma.$transaction(async (tx) => {
    const newPayment = await tx.feePayment.create({
      data: {
        invoiceId,
        studentId: invoice.studentId,
        amount,
        paymentMethod,
        transactionId: transactionId ?? null,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        status: 'COMPLETED',
        receivedBy: session.user.id,
        remarks: remarks ?? null,
      },
    })

    await tx.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaid,
        status: newInvoiceStatus,
      },
    })

    // Update denormalized fee summary on Student for fast dashboard reads
    await tx.student.update({
      where: { id: invoice.studentId },
      data: {
        paidAmount: { increment: amount },
        dueAmount: { decrement: amount },
        feeStatus: newFeeStatus,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'FeePayment',
        entityId: newPayment.id,
        changes: { invoiceId, amount, paymentMethod, newInvoiceStatus },
      },
    })

    return newPayment
  })

  return createdResponse(payment, `Payment of ${amount} recorded successfully`)
}
