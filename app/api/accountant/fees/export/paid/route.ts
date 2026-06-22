/**
 * GET /api/accountant/fees/export/paid
 * Streams an Excel export of PAID invoices.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api-response'
import { feeExportPaidSchema } from '@/lib/validation/accountant-fee'
import { buildPaidListReport } from '@/lib/excel/fee-lists'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only finance staff can export fee reports')
  }

  let campusId: string | undefined | null = session.user.campusId
  if (role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: session.user.id },
      select: { campusId: true },
    })
    campusId = acc?.campusId
    if (!campusId) return errors.forbidden('No campus context found')
  }

  const { searchParams } = new URL(request.url)
  const parsed = feeExportPaidSchema.passthrough().safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { month, academicYear, campusId: queryCampusId, classId } = parsed.data

  const targetCampus = campusId || queryCampusId

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      status: 'PAID',
      ...(month ? { month } : {}),
      ...(academicYear ? { academicYear } : {}),
      student: {
        ...(targetCampus ? { campusId: targetCampus } : {}),
        ...(classId ? { classId } : {}),
      },
    },
    include: {
      student: { include: { class: true, campus: { select: { name: true } } } },
      payments: { orderBy: { paymentDate: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const workbook = await buildPaidListReport(invoices, month)
  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer as Buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="paid-fees-${month?.replace(' ', '-') || 'all'}.xlsx"`,
    },
  })
}
