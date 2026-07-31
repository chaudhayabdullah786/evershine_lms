import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewerNote: z.string().trim().max(500).optional().nullable(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = reviewSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })

    const existing = await prisma.profileChangeRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })

    const updated = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.profileChangeRequest.update({
        where: { id },
        data: {
          status: parsed.data.status,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
          reviewerNote: parsed.data.reviewerNote ?? null,
        },
      })

      if (parsed.data.status === 'APPROVED') {
        const updatePayload: Record<string, string | Date | null> = {}
        if (requestRecord.requestedField === 'displayName') {
          updatePayload.displayName = requestRecord.proposedValue ?? null
        } else if (requestRecord.requestedField === 'profilePicture') {
          updatePayload.profilePictureUrl = requestRecord.proposedValue ?? null
        }
        updatePayload.profileUpdatedAt = new Date()
        updatePayload.profileStatus = 'ACTIVE'
        updatePayload.profileSource = 'APPROVED_REQUEST'
        await tx.user.update({ where: { id: requestRecord.userId }, data: updatePayload })
      }

      return requestRecord
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('[PROFILE_REQUESTS_PATCH]', error)
    return NextResponse.json({ success: false, error: 'Failed to review request' }, { status: 500 })
  }
}
