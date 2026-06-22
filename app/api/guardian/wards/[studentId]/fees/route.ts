/**
 * GET /api/guardian/wards/[studentId]/fees
 * Returns fee history and current outstanding balance for a ward.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { assertGuardianOwnsStudent } from '@/lib/guardian/assert-ownership'
import { guardianFeeQuerySchema } from '@/lib/validation/guardian'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden()

  const { studentId } = await params
  
  try {
    await assertGuardianOwnsStudent(session.user.id, studentId)
  } catch (error: any) {
    return errors.forbidden(error.message)
  }

  const { searchParams } = new URL(request.url)
  const parsed = guardianFeeQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { academicYear } = parsed.data

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { dueAmount: true },
  })

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      studentId,
      ...(academicYear ? { academicYear } : {}),
      // Hide internal DRAFT invoices from guardians
      status: { not: 'DRAFT' },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      challanNumber: true,
      month: true,
      academicYear: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      dueDate: true,
      paymentProofUrl: true,
    },
  })

  return successResponse({
    outstandingBalance: student?.dueAmount ?? 0,
    invoices,
  })
}
