import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // [FACT] feeInvoices is a direct relation on Student, not on StudentEnrollment.
    const overdueInvoices = await prisma.feeInvoice.findMany({
      where: {
        studentId: student.id,
        OR: [
          { status: 'OVERDUE' },
          { 
            status: 'ISSUED', 
            dueDate: { lt: new Date() } 
          }
        ],
      },
      select: { id: true, totalAmount: true, status: true, dueDate: true },
    })

    const totalOverdue = overdueInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount),
      0
    )

    return NextResponse.json({
      hasOverdue: overdueInvoices.length > 0,
      totalOverdue,
      overdueCount: overdueInvoices.length,
    })
  } catch (error) {
    console.error('Fee Overdue GET Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
