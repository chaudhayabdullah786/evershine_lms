import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  profilePictureUrl: z.string().url().optional().nullable(),
  profilePicturePublicId: z.string().optional().nullable(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        profilePictureUrl: true,
        profilePicturePublicId: true,
        profileStatus: true,
        profileUpdatedAt: true,
        profileSource: true,
      },
    })

    return NextResponse.json({ success: true, data: user })
  } catch (error) {
    console.error('[PROFILE_ME_GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to load profile' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'GUARDIAN'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })

    const payload = parsed.data
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(payload.displayName !== undefined ? { displayName: payload.displayName } : {}),
        ...(payload.profilePictureUrl !== undefined ? { profilePictureUrl: payload.profilePictureUrl } : {}),
        ...(payload.profilePicturePublicId !== undefined ? { profilePicturePublicId: payload.profilePicturePublicId } : {}),
        profileStatus: 'ACTIVE',
        profileUpdatedAt: new Date(),
        profileSource: 'SELF',
      },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        profilePictureUrl: true,
        profilePicturePublicId: true,
        profileStatus: true,
        profileUpdatedAt: true,
        profileSource: true,
      },
    })

    return NextResponse.json({ success: true, data: user })
  } catch (error) {
    console.error('[PROFILE_ME_PATCH]', error)
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 })
  }
}
