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

  let body: { status?: 'CANCELLED' | 'ISSUED'; notes?: string }
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id },
    select: { id: true, status: true, studentId: true, totalAmount: true, student: { select: { dueAmount: true } } },
  })

  if (!invoice) return errors.notFound('Fee Invoice')

  const updateData: Record<string, any> = {}
  if (body.status === 'CANCELLED') {
    if (invoice.status === 'PAID') {
      return errors.conflict('Cannot cancel a fully paid invoice')
    }
    updateData.status = 'CANCELLED'
  }
  if (body.notes !== undefined) {
    updateData.notes = body.notes
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.feeInvoice.update({
      where: { id },
      data: updateData,
      include: { items: true },
    })

    // If cancelled, adjust denormalized student outstanding fees without negative dues.
    if (body.status === 'CANCELLED' && invoice.status !== 'CANCELLED') {
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
        action: 'UPDATE',
        entityType: 'FeeInvoice',
        entityId: id,
        changes: updateData,
      },
    })

    return res
  })

  return successResponse(updated, { message: 'Invoice updated successfully' })
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
