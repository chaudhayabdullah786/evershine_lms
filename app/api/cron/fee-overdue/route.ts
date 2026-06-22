/**
 * GET /api/cron/fee-overdue
 * Cron job triggered daily at 08:00 to mark unpaid invoices past their due date as OVERDUE.
 * Triggers in-app notifications for the guardian.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { dispatchNotification } from '@/lib/notifications/in-app'

export async function GET(request: NextRequest) {
  // Ensure the request comes from Vercel Cron or contains a valid auth header in custom deployments
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const now = new Date()

  // Find all invoices that are ISSUED or PARTIALLY_PAID and have passed their due date
  const dueInvoices = await prisma.feeInvoice.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      dueDate: { lt: now },
    },
    select: { id: true, studentId: true },
  })

  if (dueInvoices.length === 0) {
    return NextResponse.json({ message: 'No overdue invoices found', count: 0 })
  }

  const invoiceIds = dueInvoices.map((inv) => inv.id)

  // Batch update status
  await prisma.$transaction(async (tx) => {
    await tx.feeInvoice.updateMany({
      where: { id: { in: invoiceIds } },
      data: { status: 'OVERDUE' },
    })

    // Create a system audit log for the bulk update
    await tx.auditLog.create({
      data: {
        userId: 'system', // Special case for cron jobs
        action: 'UPDATE',
        entityType: 'FeeInvoice',
        entityId: 'batch',
        changes: { status: 'OVERDUE', invoiceIds },
      },
    })
  })

  // Dispatch notifications for each overdue invoice
  for (const invoice of dueInvoices) {
    dispatchNotification({
      type: 'FEE_OVERDUE',
      invoiceId: invoice.id,
      studentId: invoice.studentId,
    })
  }

  return NextResponse.json({
    message: 'Processed overdue invoices successfully',
    count: invoiceIds.length,
  })
}
