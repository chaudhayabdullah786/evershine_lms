/**
 * GET /api/guardian/wards/[studentId]/fees/[invoiceId]
 * Returns single invoice details with line items.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { assertGuardianOwnsStudent } from '@/lib/guardian/assert-ownership'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string; invoiceId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden()

  const { studentId, invoiceId } = await params
  
  try {
    await assertGuardianOwnsStudent(session.user.id, studentId)
  } catch (error: any) {
    return errors.forbidden(error.message)
  }

  const invoice = await prisma.feeInvoice.findFirst({
    where: {
      id: invoiceId,
      studentId,
      status: { not: 'DRAFT' },
    },
    include: {
      items: true,
      payments: {
        orderBy: { paymentDate: 'desc' },
      },
    },
  })

  if (!invoice) return errors.notFound('Invoice not found')

  return successResponse(invoice)
}
