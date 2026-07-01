/**
 * PATCH /api/accountant/fees/invoices/[invoiceId]
 * Updates invoice status directly (e.g. marking overdue, or cancelled).
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { updateInvoiceStatusSchema } from '@/lib/validation/accountant-fee'

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

  const existing = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, totalAmount: true, studentId: true, student: { select: { campusId: true, dueAmount: true } } },
  })

  if (!existing) return errors.notFound('Invoice not found')

  if (role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: session.user.id },
      select: { campusId: true },
    })
    if (existing.student.campusId !== acc?.campusId) {
      return errors.forbidden('Cannot modify invoice for a student in a different campus')
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = updateInvoiceStatusSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  // State machine enforcement
  if (existing.status === 'PAID') {
    return errors.conflict('INVOICE_ALREADY_PAID: Cannot change status of a fully paid invoice.')
  }

  const updated = await prisma.$transaction(async (tx) => {
    // If cancelling, deduct from the student's due amount without allowing negative dues.
    if (data.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
      const remainingStudentDue = Math.max(0, Number(existing.student.dueAmount) - Number(existing.totalAmount))
      await tx.student.update({
        where: { id: existing.studentId },
        data: { dueAmount: remainingStudentDue },
      })
    }
    // If changing from CANCELLED to ISSUED, re-add
    if (existing.status === 'CANCELLED' && data.status !== 'CANCELLED') {
      await tx.student.update({
        where: { id: existing.studentId },
        data: { dueAmount: { increment: existing.totalAmount } },
      })
    }

    const inv = await tx.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        status: data.status,
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'FeeInvoice',
        entityId: invoiceId,
        changes: data,
      },
    })

    return inv
  })

  return successResponse(updated, `Invoice marked as ${data.status}`)
}
