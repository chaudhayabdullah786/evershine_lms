/**
 * GET  /api/accountant/expenses — List campus-scoped expenses
 * POST /api/accountant/expenses — Create a new expense record
 */

import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { createExpenseSchema, expenseQuerySchema } from '@/lib/validation/expense'
import { getExpenseColumnSupport, isExpensePaymentColumnMissingError } from '@/lib/accounting/expense-columns'

// Helper to resolve the campus context for the current user
async function resolveCampusId(sessionUser: { id: string; role: string; campusId?: string | null }) {
  if (sessionUser.role === 'ACCOUNTANT') {
    // Re-verify from DB just to be perfectly safe, though session should have it
    const acc = await prisma.accountant.findUnique({
      where: { userId: sessionUser.id },
      select: { campusId: true },
    })
    return acc?.campusId
  }
  return sessionUser.campusId
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  // Must have 'read' on 'fees' or 'dashboard' if we had 'expenses' resource, 
  // but let's use the explicit ACCOUNTANT/ADMIN role check since 'expenses' isn't in RBAC yet
  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only finance staff and admins can view expenses')
  }

  const campusId = await resolveCampusId(session.user)

  // If a non-super-admin has no campus context but is an accountant, they are a Global Accountant.
  // We should allow them to proceed. If they are not an accountant or admin, they shouldn't be here anyway.
  if (!campusId && role !== 'SUPER_ADMIN' && role !== 'ACCOUNTANT' && role !== 'ADMIN') {
    return errors.forbidden('No campus context found for this account')
  }

  const { searchParams } = new URL(request.url)
  const parsed = expenseQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { page, limit, category, startDate, endDate, period, campusId: filterCampusId } = parsed.data

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

  const finalCampusId = campusId || filterCampusId

  const where = {
    isDeleted: false,
    ...(finalCampusId ? { campusId: finalCampusId } : {}), // Super admins/globals use filter, others use scoped
    ...(category ? { category } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
  }

  const supportedColumns = await getExpenseColumnSupport()
  const expenseSelect = {
    id: true,
    title: true,
    description: true,
    amount: true,
    category: true,
    date: true,
    campusId: true,
    receiptUrl: true,
    notes: true,
    ...(supportedColumns.paymentSource ? { paymentSource: true } : {}),
    ...(supportedColumns.paymentReference ? { paymentReference: true } : {}),
    recordedBy: true,
    isApproved: true,
    approvedBy: true,
    isDeleted: true,
    createdAt: true,
    updatedAt: true,
    accountant: {
      select: { firstName: true, lastName: true },
    },
  }

  const [total, expenses] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { date: 'desc' },
      select: expenseSelect,
    }),
  ])

  return paginatedResponse(expenses, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only finance staff can record expenses')
  }

  const defaultCampusId = await resolveCampusId(session.user)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = createExpenseSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  const targetCampusId = defaultCampusId ?? data.campusId
  if (!targetCampusId) {
    return errors.validation({
      errors: [{ path: ['campusId'], message: 'You must select a campus to record an expense' }],
    } as never)
  }

  const supportedColumns = await getExpenseColumnSupport()

  const expensePayload = {
    title: data.title,
    description: data.description,
    amount: data.amount,
    category: data.category,
    date: new Date(data.date),
    campusId: targetCampusId,
    receiptUrl: data.receiptUrl,
    notes: data.notes,
    recordedBy: session.user.id,
    isApproved: true,
    ...(supportedColumns.paymentSource && data.paymentSource ? { paymentSource: data.paymentSource } : {}),
    ...(supportedColumns.paymentReference && data.paymentReference ? { paymentReference: data.paymentReference } : {}),
  }

  const stripPaymentMetadata = (
    payload: Prisma.ExpenseUncheckedCreateInput,
  ): Prisma.ExpenseUncheckedCreateInput => {
    const safePayload = { ...payload }
    delete safePayload.paymentSource
    delete safePayload.paymentReference
    return safePayload
  }

  let newExpense
  try {
    console.debug('[EXPENSE_CREATE] attempt', {
      userId: session.user.id,
      campusId: targetCampusId,
      supportedColumns,
      payloadKeys: Object.keys(expensePayload),
      includesPaymentSource: 'paymentSource' in expensePayload,
      includesPaymentReference: 'paymentReference' in expensePayload,
    })
    newExpense = await prisma.expense.create({ data: expensePayload })
  } catch (err) {
    if (isExpensePaymentColumnMissingError(err)) {
      const safePayload = stripPaymentMetadata(expensePayload)
      console.warn('[EXPENSE_CREATE]', 'Retrying without payment metadata after unsupported Expense payment column', {
        userId: session.user.id,
        campusId: targetCampusId,
        supportedColumns,
        keys: Object.keys(safePayload),
        hasPaymentSource: 'paymentSource' in safePayload,
        hasPaymentReference: 'paymentReference' in safePayload,
      })
      newExpense = await prisma.expense.create({ data: safePayload })
    } else {
      throw err
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Expense',
      entityId: newExpense.id,
      changes: { amount: data.amount, category: data.category },
    },
  })

  const expense = newExpense

  return createdResponse(expense, 'Expense recorded successfully')
}
