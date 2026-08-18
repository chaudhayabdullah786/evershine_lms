/**
 * GET    /api/fees/[id] — fetch single fee invoice details
 * PATCH  /api/fees/[id] — update invoice notes/status (cancel)
 * DELETE /api/fees/[id] — delete an unpaid invoice
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { updateChallanSchema } from '@/lib/validation/fee'
import type { Role } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'fees', 'read')) return errors.forbidden()

  const { id } = await params

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id },
    include: {
      items: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          registrationNumber: true,
          rollNumber: true,
          dueAmount: true,
          campus: { select: { id: true, name: true, code: true } },
          batch: { select: { id: true, name: true } },
          class: { select: { id: true, name: true, grade: true } },
          enrollments: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              status: true,
              rollNumber: true,
              classSection: {
                select: {
                  className: true,
                  sectionName: true,
                  shift: { select: { name: true, code: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!invoice) return errors.notFound('Fee Invoice')

  // Row-level scope: Students/Parents can only see their own invoices
  if (['STUDENT', 'PARENT', 'GUARDIAN'].includes(session.user.role)) {
    const isStudent = session.user.role === 'STUDENT'
    if (isStudent) {
      const student = await prisma.student.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (student?.id !== invoice.studentId) return errors.forbidden()
    } else {
      const linked = await prisma.student.findFirst({
        where: {
          id: invoice.studentId,
          OR: [
            { parents: { some: { userId: session.user.id } } },
            { guardians: { some: { userId: session.user.id } } },
          ],
        },
        select: { id: true },
      })
      if (!linked) return errors.forbidden()
    }
  }

  return successResponse(invoice)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'fees', 'update')) return errors.forbidden()

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateChallanSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)
  const input = parsed.data

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id },
    include: {
      items: true,
      student: { select: { dueAmount: true } },
    },
  })

  if (!invoice) return errors.notFound('Fee Invoice')

  const paidAmount = Number(invoice.paidAmount)
  const hasFinancialEdits = input.month !== undefined || input.academicYear !== undefined
    || input.dueDate !== undefined || input.items !== undefined
    || input.discount !== undefined || input.lateFee !== undefined
  if (hasFinancialEdits && paidAmount > 0) {
    return errors.conflict('Paid or partially paid invoices cannot be edited')
  }
  if (input.status === 'CANCELLED' && paidAmount > 0) {
    return errors.conflict('Paid or partially paid invoices cannot be cancelled')
  }
  if (invoice.status === 'CANCELLED' && hasFinancialEdits && input.status !== 'ISSUED') {
    return errors.conflict('Reissue the cancelled invoice before editing it')
  }

  const nextItems = input.items ?? invoice.items.map((item) => ({
    description: item.description,
    amount: Number(item.amount),
  }))
  const nextSubtotal = nextItems.reduce((sum, item) => sum + item.amount, 0)
  const nextDiscount = input.discount ?? Number(invoice.discount)
  const nextLateFee = input.lateFee ?? Number(invoice.lateFee)
  const nextTotal = nextSubtotal - nextDiscount + nextLateFee
  if (nextTotal < 0) return errors.validation({ errors: [{ path: ['items'], message: 'Total amount cannot be negative' }] } as never)

  const nextStatus = input.status ?? invoice.status
  const updateData: Record<string, unknown> = {
    ...(input.month !== undefined && { month: input.month }),
    ...(input.academicYear !== undefined && { academicYear: input.academicYear }),
    ...(input.dueDate !== undefined && { dueDate: new Date(input.dueDate) }),
    ...(hasFinancialEdits && { subtotal: nextSubtotal, discount: nextDiscount, lateFee: nextLateFee, totalAmount: nextTotal }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.status !== undefined && { status: nextStatus }),
  }

  const oldOutstanding = invoice.status === 'CANCELLED' ? 0 : Number(invoice.totalAmount)
  const newOutstanding = nextStatus === 'CANCELLED' ? 0 : nextTotal
  const dueDelta = newOutstanding - oldOutstanding

  const updated = await prisma.$transaction(async (tx) => {
    if (input.items !== undefined) {
      await tx.feeItem.deleteMany({ where: { invoiceId: id } })
    }

    await tx.feeInvoice.update({
      where: { id },
      data: updateData,
    })

    if (input.items !== undefined && nextItems.length > 0) {
      await tx.feeItem.createMany({
        data: nextItems.map((item) => ({ invoiceId: id, description: item.description, amount: item.amount })),
      })
    }

    if (dueDelta !== 0) {
      const remainingStudentDue = Math.max(0, Number(invoice.student.dueAmount) + dueDelta)
      await tx.student.update({
        where: { id: invoice.studentId },
        data: {
          dueAmount: remainingStudentDue,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'FeeInvoice',
        entityId: id,
        changes: { ...updateData, dueDelta },
      },
    })

    return tx.feeInvoice.findUnique({ where: { id }, include: { items: true } })
  })

  return successResponse(updated, { message: nextStatus === 'CANCELLED' ? 'Invoice cancelled successfully' : 'Invoice updated successfully' })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'fees', 'delete')) return errors.forbidden()

  const { id } = await params

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id },
    select: { id: true, status: true, studentId: true, totalAmount: true, student: { select: { dueAmount: true } } },
  })

  if (!invoice) return errors.notFound('Fee Invoice')
  if (invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID') {
    return errors.conflict('Cannot delete an invoice that has active payments')
  }

  await prisma.$transaction(async (tx) => {
    // Delete line items first
    await tx.feeItem.deleteMany({ where: { invoiceId: id } })

    // Delete invoice itself
    await tx.feeInvoice.delete({ where: { id } })

    // Deduct student dueAmount if it wasn't cancelled already, without negative dues.
    if (invoice.status !== 'CANCELLED') {
      const remainingStudentDue = Math.max(0, Number(invoice.student.dueAmount) - Number(invoice.totalAmount))
      await tx.student.update({
        where: { id: invoice.studentId },
        data: {
          dueAmount: remainingStudentDue,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'FeeInvoice',
        entityId: id,
        changes: { challanNumber: id },
      },
    })
  })

  return successResponse(null, { message: 'Invoice deleted successfully' })
}
