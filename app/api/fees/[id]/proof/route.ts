import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errorResponse, errors, successResponse } from '@/lib/api-response'
import { uploadPaymentProofToCloudinary } from '@/lib/cloudinary'
import { z } from 'zod'

const uploadProofSchema = z.object({
  proofUrl: z.string().url('Invalid image URL'),
  proofRemarks: z.string().max(500).optional(),
})

const MAX_PROOF_SIZE = 4 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!['STUDENT', 'PARENT', 'GUARDIAN'].includes(session.user.role)) return errors.forbidden()

  const { id: invoiceId } = await params

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, studentId: true, status: true },
  })

  if (!invoice) return errors.notFound('Fee invoice')
  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
    return errors.conflict(`Cannot upload proof for a ${invoice.status.toLowerCase()} invoice`)
  }

  let proofUrl: string
  let proofRemarks: string | undefined

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

  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data') || !contentType.includes('application/json')) {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return errors.validation({ errors: [{ path: [], message: 'Invalid form data' }] } as never)
    }

    const file = formData.get('file')
    const remarks = formData.get('remarks')
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return errors.validation({ errors: [{ path: ['file'], message: 'Payment proof file is required' }] } as never)
    }
    if (file.size > MAX_PROOF_SIZE) {
      return errors.validation({ errors: [{ path: ['file'], message: 'Payment proof too large. Maximum allowed size is 4 MB.' }] } as never)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      proofUrl = await uploadPaymentProofToCloudinary(buffer, `${invoiceId}-${Date.now()}`)
    } catch (uploadErr: unknown) {
      const message = uploadErr instanceof Error ? uploadErr.message : 'Payment proof upload failed'
      if (message.startsWith('Invalid payment proof') || message.startsWith('Payment proof too large')) {
        return errors.validation({ errors: [{ path: ['file'], message }] } as never)
      }
      console.error('[FEE_PROOF_UPLOAD]', uploadErr)
      return errorResponse(
        'PAYMENT_PROOF_UPLOAD_FAILED',
        'Payment proof upload failed. Please verify Cloudinary configuration and try again.',
        500
      )
    }
    proofRemarks = typeof remarks === 'string' ? remarks.slice(0, 500) : undefined
  } else {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
    }

    const parsed = uploadProofSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    proofUrl = parsed.data.proofUrl
    proofRemarks = parsed.data.proofRemarks
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
