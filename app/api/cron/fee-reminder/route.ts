/**
 * GET /api/cron/fee-reminder
 *
 * Runs daily via Vercel Cron.
 * Finds overdue fee invoices and sends email reminders.
 *
 * SECURITY: Protected by CRON_SECRET authorization header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const today = new Date()

  // Find overdue invoices
  const overdueInvoices = await prisma.feeInvoice.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      dueDate: { lt: today },
    },
    include: {
      student: { select: { firstName: true, lastName: true, email: true, parents: { include: { user: { select: { email: true } } } } } },
    },
  })

  let remindersSent = 0

  for (const invoice of overdueInvoices) {
    // Update invoice status to OVERDUE if it's not already
    if (invoice.status !== 'OVERDUE') {
      await prisma.$transaction([
        prisma.feeInvoice.update({
          where: { id: invoice.id },
          data: { status: 'OVERDUE' },
        }),
        prisma.student.update({
          where: { id: invoice.studentId },
          data: { feeStatus: 'OVERDUE' },
        })
      ])
    }

    // Collect emails (student + parents)
    const emails = new Set<string>()
    if (invoice.student.email) emails.add(invoice.student.email)
    invoice.student.parents.forEach((p) => {
      if (p.user.email) emails.add(p.user.email)
    })

    if (emails.size === 0) continue

    const balance = Number(invoice.totalAmount) - Number(invoice.paidAmount)

    const sent = await sendEmail({
      to: Array.from(emails),
      subject: `Fee Reminder: Overdue Balance for ${invoice.student.firstName} ${invoice.student.lastName}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #DC2626;">Fee Reminder</h2>
          <p>Dear Parent/Guardian,</p>
          <p>This is a reminder that the fee challan (<b>${invoice.challanNumber}</b>) for the month of <b>${invoice.month}</b> is now overdue.</p>
          <p><b>Outstanding Balance: Rs. ${balance.toFixed(2)}</b></p>
          <p>Please arrange for the payment at your earliest convenience to avoid further late fees or suspension of portal access.</p>
          <p>If you have already paid, please ignore this email.</p>
          <br/>
          <p>Regards,<br/>Evershine Academy Accounts Department</p>
        </div>
      `,
    })

    if (sent) remindersSent++
  }

  return NextResponse.json({
    success: true,
    totalOverdue: overdueInvoices.length,
    remindersSent,
  })
}
