import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const uploadProofSchema = z.object({
  proofUrl: z.string().url('Invalid image URL'),
  proofRemarks: z.string().max(500).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!['STUDENT', 'PARENT', 'GUARDIAN'].includes(session.user.role)) return errors.forbidden()

  const { id: invoiceId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = uploadProofSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { proofUrl, proofRemarks } = parsed.data

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, studentId: true, status: true },
  })

  if (!invoice) return errors.notFound('Fee invoice')
  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
    return errors.conflict(`Cannot upload proof for a ${invoice.status.toLowerCase()} invoice`)
  }

  // Verify ownership
  if (session.user.role === 'STUDENT') {
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

  const updatedInvoice = await prisma.$transaction(async (tx) => {
    const res = await tx.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        proofUrl,
        proofRemarks,
        proofUploadedAt: new Date(),
        proofStatus: 'PENDING',
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'FeeInvoice',
        entityId: invoiceId,
        changes: { proofStatus: 'PENDING', proofUrl },
      },
    })

    return res
  })

  return successResponse(updatedInvoice, { message: 'Payment proof submitted for approval' })
}
