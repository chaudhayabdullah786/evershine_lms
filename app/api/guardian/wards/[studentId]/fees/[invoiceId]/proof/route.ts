/**
 * POST /api/guardian/wards/[studentId]/fees/[invoiceId]/proof
 * Uploads a payment proof (multipart/form-data) for an invoice.
 *
 * SECURITY (CWE-434 mitigation):
 * Validates file content using magic bytes (not just extension)
 * before streaming to Cloudinary.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { assertGuardianOwnsStudent } from '@/lib/guardian/assert-ownership'
import cloudinary from '@/lib/cloudinary'
import { dispatchNotification } from '@/lib/notifications/in-app'

// Maximum file size: 4MB (Vercel payload limit is 4.5MB)
const MAX_FILE_SIZE = 4 * 1024 * 1024

/**
 * Validates magic bytes for JPEG, PNG, or PDF.
 * Returns true if valid, false otherwise.
 */
function validateMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) return false

  const hex = buffer.toString('hex', 0, 4).toUpperCase()
  
  // JPEG: FF D8 FF
  if (hex.startsWith('FFD8FF')) return true
  
  // PNG: 89 50 4E 47
  if (hex.startsWith('89504E47')) return true
  
  // PDF: 25 50 44 46 (%PDF)
  if (hex.startsWith('25504446')) return true

  return false
}

export async function POST(
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

  // Verify invoice exists and is unpaid
  const invoice = await prisma.feeInvoice.findFirst({
    where: {
      id: invoiceId,
      studentId,
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    select: { id: true, student: { select: { campus: { select: { accountants: { select: { userId: true } } } } } } },
  })

  if (!invoice) {
    return errors.conflict('Invoice not found, or it is already paid/cancelled.')
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    return errors.validation({ errors: [{ path: [], message: 'Invalid form data' }] } as never)
  }

  const file = formData.get('file') as File | null
  const remarks = formData.get('remarks') as string | null

  if (!file) return errors.validation({ errors: [{ path: ['file'], message: 'File is required' }] } as never)
  if (!remarks || remarks.trim().length < 5) {
    return errors.validation({ errors: [{ path: ['remarks'], message: 'Please provide at least a brief description' }] } as never)
  }

  if (file.size > MAX_FILE_SIZE) {
    return errors.conflict('File exceeds maximum size of 4MB')
  }

  // Buffer and Magic Byte Validation
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  
  if (!validateMagicBytes(buffer)) {
    return errors.conflict('Invalid file format. Only JPG, PNG, and PDF are allowed.')
  }

  // Upload to Cloudinary using stream
  const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'evershaheen/fee-proofs',
        resource_type: 'auto',
      },
      (error, result) => {
        if (error || !result) reject(error || new Error('Upload failed'))
        else resolve(result)
      }
    )
    uploadStream.end(buffer)
  }).catch((err) => {
    console.error('[PROOF_UPLOAD] Cloudinary error:', err)
    return null
  })

  if (!uploadResult) {
    return errors.internal()
  }

  // Atomic update: Record proof and audit log
  const updatedInvoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        proofUrl: uploadResult.secure_url,
        proofRemarks: remarks,
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
        changes: { proofStatus: 'PENDING', proofUrl: uploadResult.secure_url },
      },
    })

    return inv
  })

  // Fire and forget notification to campus accountants
  const accountantIds = invoice.student.campus.accountants.map((a) => a.userId)
  for (const accountantUserId of accountantIds) {
    dispatchNotification({
      type: 'PROOF_RECEIVED',
      invoiceId,
      accountantUserId,
    })
  }

  return successResponse(updatedInvoice, 'Payment proof submitted successfully. It will be reviewed by the accounts team.')
}
