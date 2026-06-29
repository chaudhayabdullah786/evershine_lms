/**
 * GET /api/accountant/fees/export/defaulters
 * Streams an Excel export of students with outstanding dues.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api-response'
import { feeExportDefaultersSchema } from '@/lib/validation/accountant-fee'
import { buildDefaulterListReport } from '@/lib/excel/fee-lists'

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
  const parsed = feeExportDefaultersSchema.passthrough().safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { academicYear, campusId: queryCampusId, classId } = parsed.data

  const targetCampus = campusId || queryCampusId

  const students = await prisma.student.findMany({
    where: {
      dueAmount: { gt: 0 },
      feeStatus: { in: ['PENDING', 'PARTIALLY_PAID'] },
      ...(academicYear ? { academicYear } : {}),
      ...(targetCampus ? { campusId: targetCampus } : {}),
      ...(classId ? { classId } : {}),
    },
    include: {
      campus: { select: { name: true } },
      class: true,
      feeInvoices: {
        where: { status: { in: ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'] } },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { dueAmount: 'desc' }, // Highest defaulters first
  })

  const workbook = await buildDefaulterListReport(
    students.map((student) => ({
      ...student,
      invoices: student.feeInvoices,
    }))
  )
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = Buffer.from(buffer)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="fee-defaulters-${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  })
}
