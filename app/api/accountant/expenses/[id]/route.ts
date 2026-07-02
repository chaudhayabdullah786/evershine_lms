/**
 * GET    /api/accountant/expenses/[id]
 * PATCH  /api/accountant/expenses/[id]
 * DELETE /api/accountant/expenses/[id] (Soft delete)
 */

import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { updateExpenseSchema } from '@/lib/validation/expense'
import { getExpenseColumnSupport, isExpensePaymentColumnMissingError } from '@/lib/accounting/expense-columns'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden()
  }

  const { id } = await params

  const supportedColumns = await getExpenseColumnSupport()
  const expense = await prisma.expense.findUnique({
    where: { id, isDeleted: false },
    select: {
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
      accountant: { select: { firstName: true, lastName: true } },
    },
  })

  if (!expense) return errors.notFound('Expense not found')

  // Enforce campus scoping
  if (role === 'ACCOUNTANT' && expense.campusId !== session.user.campusId) {
    return errors.forbidden('Expense belongs to a different campus')
  }

  return successResponse(expense)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden()
  }

  const { id } = await params

  const existing = await prisma.expense.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, campusId: true, isDeleted: true },
  })

  if (!existing) return errors.notFound('Expense not found')
  if (role === 'ACCOUNTANT' && existing.campusId !== session.user.campusId) {
    return errors.forbidden('Expense belongs to a different campus')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = updateExpenseSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const updated = await prisma.$transaction(async (tx) => {
    const updatePayload: Prisma.ExpenseUncheckedUpdateInput = {
      ...(parsed.data.title && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.amount && { amount: parsed.data.amount }),
      ...(parsed.data.category && { category: parsed.data.category }),
      ...(parsed.data.date && { date: new Date(parsed.data.date) }),
      ...(parsed.data.receiptUrl !== undefined && { receiptUrl: parsed.data.receiptUrl }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      ...(parsed.data.paymentSource !== undefined && { paymentSource: parsed.data.paymentSource }),
      ...(parsed.data.paymentReference !== undefined && { paymentReference: parsed.data.paymentReference }),
    }

    let e
    try {
      e = await tx.expense.update({ where: { id }, data: updatePayload })
    } catch (err) {
      if (isExpensePaymentColumnMissingError(err)) {
        const safePayload = { ...updatePayload }
        delete safePayload.paymentSource
        delete safePayload.paymentReference
        e = await tx.expense.update({ where: { id }, data: safePayload })
      } else {
        throw err
      }
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Expense',
        entityId: id,
        changes: parsed.data,
      },
    })

    return e
  })

  return successResponse(updated, 'Expense updated successfully')
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden()
  }

  const { id } = await params

  const existing = await prisma.expense.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, campusId: true, isDeleted: true },
  })

  if (!existing) return errors.notFound('Expense not found')
  if (role === 'ACCOUNTANT' && existing.campusId !== session.user.campusId) {
    return errors.forbidden('Expense belongs to a different campus')
  }

  // Soft delete inside transaction
  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: { isDeleted: true },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE', // Audited as DELETE, implemented as soft-delete
        entityType: 'Expense',
        entityId: id,
        changes: { isDeleted: true },
      },
    })
  })

  return successResponse(null, 'Expense deleted successfully')
}
