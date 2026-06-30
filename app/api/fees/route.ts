/**
 * GET  /api/fees  — list fee invoices with filters
 * POST /api/fees  — generate a new fee challan
 *
 * WHY challan number format ESA/{YY-YY}/{month}/{seq}:
 * Provides human-readable traceability. Bank tellers reference this number
 * when recording deposits.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse, createdResponse, paginatedResponse } from '@/lib/api-response'
import { generateChallanSchema, feeQuerySchema } from '@/lib/validation/fee'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'fees', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = feeQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { page, limit, studentId, status, proofStatus, month, academicYear } = parsed.data

  let where: any = {
    ...(status && { status }),
    ...(proofStatus && { proofStatus }),
    ...(month && { month: { contains: month, mode: 'insensitive' as const } }),
    ...(academicYear && { academicYear }),
  }

  // WHY: Students and Parents only see their own fee records securely, bypassing client-provided filters
  if (session.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    where.studentId = student?.id ?? 'NO_STUDENT'
  } else if (['PARENT', 'GUARDIAN'].includes(session.user.role)) {
    const children = await prisma.student.findMany({
      where: {
        OR: [
          { parents: { some: { userId: session.user.id } } },
          { guardians: { some: { userId: session.user.id } } },
        ],
      },
      select: { id: true },
    })
    const childrenIds = children.map(c => c.id)
    if (studentId) {
      where.studentId = childrenIds.includes(studentId) ? studentId : 'NO_STUDENT'
    } else {
      where.studentId = { in: childrenIds.length > 0 ? childrenIds : ['NO_STUDENT'] }
    }
  } else {
    // Admin/Accountant role
    if (studentId) where.studentId = studentId
  }

  const [total, invoices] = await prisma.$transaction([
    prisma.feeInvoice.count({ where }),
    prisma.feeInvoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            registrationNumber: true,
            campus: { select: { name: true } },
            batch: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    }),
  ])

  return paginatedResponse(invoices, { page, limit, total })
}


export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!checkPermission(session.user.role as Role, 'fees', 'create')) return errors.forbidden()

    let body: any
    try {
      body = await request.json()
    } catch {
      return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
    }

    const parsed = generateChallanSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation(parsed.error)
    }

    const { studentId, month, academicYear, dueDate, bankAccounts, items, discount, lateFee, notes } = parsed.data

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        isActive: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        registrationNumber: true,
      },
    })
    if (!student || !student.isActive) {
      return errors.notFound('Student')
    }

    const duplicate = await prisma.feeInvoice.findFirst({
      where: { studentId, month, academicYear, status: { not: 'CANCELLED' } },
      select: { challanNumber: true },
    })
    if (duplicate) {
      return errors.conflict(
        `A challan for ${month} (${academicYear}) already exists: ${duplicate.challanNumber}`
      )
    }

    const monthCode = month.split(' ')[0].slice(0, 3).toUpperCase()
    const parts = academicYear.split('-')
    const yearCode = parts.length === 2 
      ? `${parts[0].slice(-2)}${parts[1].slice(-2)}` 
      : academicYear.replace('-', '').slice(2, 6)

    const studentIdentifier = student.rollNumber && student.rollNumber.trim()
      ? student.rollNumber.trim().replace(/\//g, '-')
      : student.registrationNumber.replace(/\//g, '-')

    const challanNumber = `CHL/${studentIdentifier}/${yearCode}/${monthCode}`

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
    const totalAmount = subtotal - discount + lateFee

    // WHY 30s timeout: challan generation involves creating invoice + items + audit log
    // Default 5s timeout is too short for slower DB operations; 30s ensures completion
    const invoice = await prisma.$transaction(
      async (tx) => {
        const newInvoice = await tx.feeInvoice.create({
          data: {
            challanNumber,
            studentId,
            month,
            academicYear,
            dueDate: new Date(dueDate),
            subtotal,
            discount,
            lateFee,
            totalAmount,
            status: 'ISSUED',
            bankAccounts: bankAccounts ?? null,
            notes: notes ?? null,
            issuedBy: session.user.id,
            items: {
              create: items.map((item) => ({
                description: item.description,
                amount: item.amount,
              })),
            },
          },
          include: { items: true },
        })

        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'CREATE',
            entityType: 'FeeInvoice',
            entityId: newInvoice.id,
            changes: { challanNumber, studentId, totalAmount },
          },
        })

        await tx.student.update({
          where: { id: studentId },
          data: {
            dueAmount: { increment: totalAmount },
            feeStatus: 'PENDING',
          },
        })

        return newInvoice
      },
      { timeout: 30000 }
    )

    return createdResponse(invoice, `Challan ${challanNumber} generated successfully`)
  } catch (error: any) {
    console.error('[GENERATE_CHALLAN_ERROR]', error)
    if (error.code === 'P2002') {
      return errors.conflict(
        'A fee challan with this generated challan number already exists. Please verify student records or update the period.'
      )
    }
    return errors.internal()
  }
}

