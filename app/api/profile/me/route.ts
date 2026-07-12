import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import cloudinary, { sanitizeCloudinaryError, uploadImageBufferToCloudinary } from '@/lib/cloudinary'

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

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (err) {
      return NextResponse.json(
        { success: false, error: 'Invalid form data. Please submit the profile form again.' },
        { status: 400 }
      )
    }

    const displayName = formData.get('displayName')?.toString()?.trim()
    const profileImageField = formData.get('profileImage')
    const profileImageFile = profileImageField && typeof (profileImageField as any)?.arrayBuffer === 'function' && typeof (profileImageField as any)?.size === 'number'
      ? (profileImageField as File)
      : null

    if (!displayName && !profileImageFile) {
      return NextResponse.json(
        { success: false, error: 'Please provide a display name or a profile image to update.' },
        { status: 400 }
      )
    }

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
      if (profileImageFile.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: 'Profile picture must be smaller than 5 MB.' },
          { status: 400 }
        )
      }

      try {
        const buffer = Buffer.from(await profileImageFile.arrayBuffer())
        const currentUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { profilePicturePublicId: true },
        })
        const existingPublicId = currentUser?.profilePicturePublicId ?? null
        const uploadResult = await uploadImageBufferToCloudinary(
          buffer,
          'evershine-academy/profile-pictures',
          `${session.user.id}-${Date.now()}`
        )

        profilePictureUrl = uploadResult.secureUrl
        profilePicturePublicId = uploadResult.publicId

        if (existingPublicId) {
          cloudinary.uploader.destroy(existingPublicId).catch((delErr) => {
            console.warn('[PROFILE_PICTURE_DELETE_OLD]', delErr)
          })
        }
      } catch (uploadErr: unknown) {
        const sanitized = sanitizeCloudinaryError(uploadErr)
        console.error('[PROFILE_PICTURE_UPLOAD]', sanitized)
        const message = sanitized.message || 'Failed to upload profile picture. Please verify the image and try again.'
        return NextResponse.json(
          { success: false, error: message },
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

    const responsePayload: any = { success: true, data: user }
    if (imageUploadWarning) {
      responsePayload.warning = imageUploadWarning
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('[PROFILE_ME_PATCH]', error)
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 })
  }
}
