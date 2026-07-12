import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import cloudinary from '@/lib/cloudinary'

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

    const formData = await request.formData()
    const displayName = formData.get('displayName')?.toString()?.trim()
    const profileImageFile = formData.get('profileImage') as File | null

    // Validate displayName if provided
    if (displayName !== undefined && displayName !== null && displayName !== '') {
      if (displayName.length < 2 || displayName.length > 80) {
        return NextResponse.json(
          { success: false, error: 'Display name must be between 2 and 80 characters' },
          { status: 400 }
        )
      }
    }

    let profilePictureUrl: string | null = null
    let profilePicturePublicId: string | null = null

    // Handle file upload if provided
    if (profileImageFile && profileImageFile.size > 0) {
      try {
        const buffer = Buffer.from(await profileImageFile.arrayBuffer())

        // Delete old image if it exists
        const currentUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { profilePicturePublicId: true },
        })

        if (currentUser?.profilePicturePublicId) {
          try {
            await cloudinary.uploader.destroy(currentUser.profilePicturePublicId)
          } catch (delErr) {
            console.warn('[PROFILE_PICTURE_DELETE_OLD]', delErr)
          }
        }

        // Upload new image
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'evershine-academy/profile-pictures',
              resource_type: 'auto',
              width: 400,
              height: 400,
              crop: 'fill',
              quality: 'auto',
              fetch_format: 'auto',
            },
            (error, result) => {
              if (error) reject(error)
              else resolve(result)
            }
          )
          stream.end(buffer)
        })

        const result = uploadResult as any
        profilePictureUrl = result.secure_url
        profilePicturePublicId = result.public_id
      } catch (uploadErr) {
        console.error('[PROFILE_PICTURE_UPLOAD]', uploadErr)
        return NextResponse.json(
          { success: false, error: 'Failed to upload profile picture. Please try again.' },
          { status: 500 }
        )
      }
    }

    // Update user profile
    const updateData: any = {
      profileStatus: 'ACTIVE',
      profileUpdatedAt: new Date(),
      profileSource: 'SELF',
    }

    if (displayName !== undefined && displayName !== null && displayName !== '') {
      updateData.displayName = displayName
    }

    if (profilePictureUrl !== null) {
      updateData.profilePictureUrl = profilePictureUrl
      updateData.profilePicturePublicId = profilePicturePublicId
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
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
