/**
 * GET /api/accountant/fees/pending-proofs
 * Returns all fee invoices with proofStatus === 'PENDING' scoped to accountant's campus.
 * Admins/Super Admins see all campuses.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role
  if (role !== 'ACCOUNTANT' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return errors.forbidden()
  }

  // Scope to accountant's campus (admins see all)
  let campusFilter: { campusId?: string } = {}
  if (role === 'ACCOUNTANT') {
    const acc = await prisma.accountant.findUnique({
      where: { userId: session.user.id },
      select: { campusId: true },
    })
    if (!acc) return errors.forbidden('No accountant profile found')
    campusFilter = { campusId: acc.campusId }
  }

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      proofStatus: 'PENDING',
      status: { notIn: ['PAID', 'CANCELLED'] },
      student: campusFilter,
    },
    select: {
      id: true,
      challanNumber: true,
      month: true,
      academicYear: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      proofUrl: true,
      proofRemarks: true,
      proofUploadedAt: true,
      proofStatus: true,
      dueDate: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          registrationNumber: true,
          fatherName: true,
          campus: { select: { name: true } },
          class: { select: { name: true, grade: true } },
        },
      },
    },
    orderBy: { proofUploadedAt: 'asc' }, // Oldest first — FIFO queue
  })

  return successResponse(invoices)
}
