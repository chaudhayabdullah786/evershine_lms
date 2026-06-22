import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculatePenaltyAmount } from '@/lib/academic/engine'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const overdue = await prisma.feeInvoice.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      dueDate: { lt: now },
      isPenaltyApplied: false,
    },
    include: { student: { select: { campusId: true, batchId: true, userId: true } } },
    take: 500,
  })

  let applied = 0
  for (const invoice of overdue) {
    const policy =
      (await prisma.feePolicy.findFirst({
        where: { campusId: invoice.student.campusId, batchId: invoice.student.batchId, isActive: true },
      })) ??
      (await prisma.feePolicy.findFirst({
        where: { campusId: invoice.student.campusId, batchId: null, isActive: true },
      })) ??
      (await prisma.feePolicy.findFirst({ where: { campusId: null, batchId: null, isActive: true } }))

    if (!policy) continue

    const graceEnd = new Date(invoice.dueDate)
    graceEnd.setDate(graceEnd.getDate() + policy.graceDays)
    if (now < graceEnd) continue

    const base = Number(invoice.totalAmount) - Number(invoice.paidAmount)
    const penalty = calculatePenaltyAmount(
      policy.penaltyType,
      policy.penaltyValue,
      base,
      policy.maxPenalty
    )

    const systemUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })

    await prisma.$transaction(async (tx) => {
      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          penaltyAmount: penalty,
          isPenaltyApplied: true,
          lateFee: { increment: penalty },
          totalAmount: { increment: penalty },
          status: 'OVERDUE',
        },
      })
      await tx.student.update({
        where: { id: invoice.studentId },
        data: { dueAmount: { increment: penalty }, totalFeeAmount: { increment: penalty } },
      })
      if (systemUser) {
        await tx.auditLog.create({
          data: {
            userId: systemUser.id,
            action: 'PENALTY',
            entityType: 'FeeInvoice',
            entityId: invoice.id,
            changes: { penalty, policyId: policy.id },
          },
        })
      }
      await tx.notification.create({
        data: {
          userId: invoice.student.userId,
          title: 'Fee penalty applied',
          message: `A late fee penalty of Rs ${penalty} was added to challan ${invoice.challanNumber}.`,
          type: 'GENERAL',
          relatedId: invoice.id,
        },
      })
    })
    applied++
  }

  return NextResponse.json({ success: true, applied, processed: overdue.length })
}
