import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getChildrenForGuardianUser } from '@/lib/academic/guardian'
import { outstandingInvoiceAmount } from '@/lib/fees/reporting'

export async function GET() {
  try {
    const session = await auth()
    const role = session?.user?.role
    if (!session?.user?.id || !['STUDENT', 'PARENT', 'GUARDIAN'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const students = role === 'STUDENT'
      ? await prisma.student.findUnique({
          where: { userId: session.user.id },
          select: { id: true, firstName: true, lastName: true },
        }).then((student) => student ? [student] : [])
      : await getChildrenForGuardianUser(session.user.id)

    if (students.length === 0) {
      return NextResponse.json({ hasOverdue: false, totalOverdue: 0, overdueCount: 0, invoices: [] })
    }

    const studentIds = students.map((student) => student.id)
    const overdueInvoices = await prisma.feeInvoice.findMany({
      where: {
        studentId: { in: studentIds },
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
        OR: [
          { status: 'OVERDUE' },
          { dueDate: { lt: new Date() } },
        ],
      },
      select: {
        id: true,
        challanNumber: true,
        month: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        dueDate: true,
        studentId: true,
        payments: { select: { amount: true, status: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    const studentById = new Map(students.map((student) => [student.id, student]))
    const invoices = overdueInvoices
      .map((invoice) => ({
        id: invoice.id,
        challanNumber: invoice.challanNumber,
        month: invoice.month,
        status: invoice.status,
        dueDate: invoice.dueDate.toISOString(),
        studentId: invoice.studentId,
        studentName: `${studentById.get(invoice.studentId)?.firstName ?? ''} ${studentById.get(invoice.studentId)?.lastName ?? ''}`.trim(),
        outstandingAmount: outstandingInvoiceAmount(invoice.totalAmount, invoice.paidAmount, invoice.payments),
      }))
      .filter((invoice) => invoice.outstandingAmount > 0)

    const totalOverdue = invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0)

    return NextResponse.json({
      hasOverdue: invoices.length > 0,
      totalOverdue,
      overdueCount: invoices.length,
      invoices,
    })
  } catch (error) {
    console.error('Fee Overdue GET Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
