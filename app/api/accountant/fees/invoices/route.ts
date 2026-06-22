/**
 * POST /api/accountant/fees/invoices
 * Generates a new FeeInvoice with items, updates Student dueAmount.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { accountantCreateInvoiceSchema } from '@/lib/validation/accountant-fee'
import { generateChallanNumber } from '@/lib/fees/challan-number'
import { dispatchNotification } from '@/lib/notifications/in-app'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  
  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only finance staff can generate invoices')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never)
  }

  const parsed = accountantCreateInvoiceSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  const student = await prisma.student.findUnique({
    where: { id: data.studentId },
    select: { id: true, campusId: true },
  })

  if (!student) return errors.notFound('Student not found')

  if (role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: session.user.id },
      select: { campusId: true },
    })
    // If the accountant is scoped to a campus, enforce campus boundary.
    // If `acc.campusId` is null/undefined the accountant has all-campuses access.
    if (acc?.campusId && student.campusId !== acc.campusId) {
      return errors.forbidden('Cannot generate invoice for a student in a different campus')
    }
  }

  const challanNumber = await generateChallanNumber(data.academicYear)
  const totalItems = data.items.reduce((sum, item) => sum + item.amount, 0)
  const totalAmount = totalItems - data.discount

  const invoice = await prisma.$transaction(async (tx) => {
    // Create Invoice and Items
    const newInvoice = await tx.feeInvoice.create({
      data: {
        challanNumber,
        studentId: data.studentId,
        month: data.month,
        academicYear: data.academicYear,
        subtotal: totalItems,
        totalAmount,
        dueDate: new Date(data.dueDate),
        status: 'ISSUED', // Skip DRAFT state for direct generation
        discount: data.discount,
        notes: data.notes ?? null,
        issuedBy: session.user.id,
        items: {
          create: data.items.map(item => ({
            description: item.description,
            amount: item.amount,
          })),
        },
      },
    })

    // Update Student outstanding balance
    await tx.student.update({
      where: { id: data.studentId },
      data: {
        dueAmount: { increment: totalAmount },
        feeStatus: 'PENDING', // New invoice should set student fee status to pending
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'FeeInvoice',
        entityId: newInvoice.id,
        changes: { challanNumber, totalAmount, month: data.month },
      },
    })

    return newInvoice
  })

  // Notify Guardians
  dispatchNotification({
    type: 'FEE_INVOICE_GENERATED',
    invoiceId: invoice.id,
    studentId: invoice.studentId,
  })

  return createdResponse(invoice, 'Invoice generated successfully')
}
