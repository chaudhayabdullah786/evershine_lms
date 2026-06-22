/**
 * GET /api/accountant/expenses/export
 * Streams an Excel export of expenses based on query filters.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api-response'
import { expenseExportSchema } from '@/lib/validation/expense'
import { buildExpenseReport } from '@/lib/excel/expense-report'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only finance staff and admins can export expenses')
  }

  const { searchParams } = new URL(request.url)
  const rawParams = Object.fromEntries(searchParams)
  const parsed = expenseExportSchema.passthrough().safeParse(rawParams)
  if (!parsed.success) return errors.validation(parsed.error)

  const { category, startDate, endDate, period, campusId: queryCampusId } = parsed.data

  let campusId: string | undefined | null = session.user.campusId
  if (role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: session.user.id },
      select: { campusId: true },
    })
    campusId = acc?.campusId ?? campusId
    if (!campusId && queryCampusId) {
      campusId = queryCampusId
    }
    if (!campusId) {
      return errors.forbidden('No campus context found')
    }
  }

  if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && !campusId && queryCampusId) {
    campusId = queryCampusId
  }

  let dateFilter = {}
  if (startDate && endDate) {
    dateFilter = { gte: new Date(startDate), lte: new Date(endDate) }
  } else if (period) {
    const now = new Date()
    let start = new Date()
    switch (period) {
      case 'daily':   start = new Date(now.setHours(0, 0, 0, 0)); break
      case 'weekly':  start = new Date(now.setDate(now.getDate() - 7)); break
      case 'monthly': start = new Date(now.getFullYear(), now.getMonth(), 1); break
      case 'yearly':  start = new Date(now.getFullYear(), 0, 1); break
    }
    dateFilter = { gte: start }
  }

  const where = {
    isDeleted: false,
    ...(campusId ? { campusId } : {}),
    ...(category ? { category } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { date: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      amount: true,
      category: true,
      date: true,
      campusId: true,
      campus: { select: { name: true } },
      receiptUrl: true,
      notes: true,
      paymentSource: true,
      paymentReference: true,
      recordedBy: true,
      isApproved: true,
      approvedBy: true,
      isDeleted: true,
      createdAt: true,
      updatedAt: true,
      accountant: {
        select: { firstName: true, lastName: true },
      },
    },
  })

  const workbook = await buildExpenseReport(expenses, { start: startDate, end: endDate, category })

  // Use a modern approach for streaming the ExcelJS workbook into a Web Response.
  // ExcelJS writes a Buffer-like payload; convert it to a pure ArrayBuffer for NextResponse compatibility.
  const workbookBuffer = await workbook.xlsx.writeBuffer()
  const payload = new Uint8Array(workbookBuffer).buffer

  return new NextResponse(payload, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="expenses-${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  })
}
