import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const requestSchema = z.object({
  requestedField: z.enum(['displayName', 'profilePicture']),
  proposedValue: z.string().trim().max(500).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const requests = await prisma.profileChangeRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { user: true, requestedBy: true },
    })

    return NextResponse.json({ success: true, data: requests })
  } catch (error) {
    console.error('[PROFILE_REQUESTS_GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to load requests' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'STUDENT') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

    const reqRecord = await prisma.profileChangeRequest.create({
      data: {
        userId: session.user.id,
        requestedById: session.user.id,
        requestedField: parsed.data.requestedField,
        proposedValue: parsed.data.proposedValue ?? null,
        currentValue: parsed.data.requestedField === 'displayName' ? user.displayName ?? null : user.profilePictureUrl ?? null,
        reason: parsed.data.reason ?? null,
      },
    })

    return NextResponse.json({ success: true, data: reqRecord })
  } catch (error) {
    console.error('[PROFILE_REQUESTS_POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to create request' }, { status: 500 })
  }
}
