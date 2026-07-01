/**
 * GET /api/students/[id] — fetch a single student's full profile
 * PATCH /api/students/[id] — update student details (Admin/Super Admin only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errorResponse, errors, successResponse } from '@/lib/api-response'
import { updateStudentSchema } from '@/lib/validation/student'
import { enrollmentInclude } from '@/lib/students/enrollment-sync'
import { isProfileImageDataUrl, uploadProfileImageToCloudinary } from '@/lib/cloudinary'
import type { Role } from '@prisma/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'read')) return errors.forbidden()

  const { id } = await params

  // Row-level scope: Students can only see their own profile
  const isStudent = session.user.role === 'STUDENT'

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, isActive: true, lastLogin: true } },
      campus: { select: { id: true, name: true, code: true } },
      batch: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, grade: true } },
      house: { select: { id: true, name: true, color: true } },
      guardians: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          email: true,
          relationship: true,
          cnic: true,
        },
      },
      enrollments: {
        include: enrollmentInclude,
        orderBy: [{ academicYear: { startDate: 'desc' } }, { createdAt: 'desc' }],
      },
    },
  })

  if (!student) return errors.notFound('Student')
  if (student.isActive === false && !checkPermission(session.user.role as Role, 'students', 'update')) {
    return errors.notFound('Student')
  }

  // Students may only access their own profile
  // WHY: RBAC grants STUDENT role 'read' on 'students' resource (broad access),
  // but row-level restriction prevents cross-student data access.
  if (isStudent) {
    const own = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (own?.id !== id) return errors.forbidden()
  }

  return successResponse(student)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'update')) return errors.forbidden()

  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const existing = await prisma.student.findUnique({ where: { id }, select: { id: true, registrationNumber: true } })
  if (!existing) return errors.notFound('Student')

  const parsed = updateStudentSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const {
    parentEmail: _pe,
    campusId: _c,
    batchId: _b,
    classSectionId: _cs,
    shift: _sh,
    deliveryMode: _dm,
    totalFeeAmount: _fee,
    cnicBForm: _cnic,
    isActive: _active,
    ...rest
  } = parsed.data

  const safeData: Record<string, unknown> = { ...rest }
  if (safeData.email === '') safeData.email = null

  const submittedProfilePicture = typeof safeData.profilePicture === 'string' ? safeData.profilePicture : null
  if (isProfileImageDataUrl(submittedProfilePicture)) {
    try {
      safeData.profilePicture = await uploadProfileImageToCloudinary(
        submittedProfilePicture,
        'students',
        existing.registrationNumber
      )
    } catch (uploadErr: unknown) {
      const message = uploadErr instanceof Error ? uploadErr.message : 'Profile image upload failed'
      if (message.startsWith('Invalid image') || message.startsWith('Image too large')) {
        return errors.validation({ errors: [{ path: ['profilePicture'], message }] } as never)
      }
      console.error('[STUDENT_PATCH_PROFILE_IMAGE_UPLOAD]', uploadErr)
      return errorResponse(
        'PROFILE_IMAGE_UPLOAD_FAILED',
        'Profile image upload failed. Please verify Cloudinary configuration and try again.',
        500
      )
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (safeData.dateOfBirth && typeof safeData.dateOfBirth === 'string') {
        safeData.dateOfBirth = new Date(safeData.dateOfBirth)
      }

      if (safeData.classId && typeof safeData.classId === 'string') {
        const cls = await tx.class.findUnique({
          where: { id: safeData.classId },
          select: { shift: true },
        })
        if (cls) safeData.shift = cls.shift
      }

      const result = await tx.student.update({
        where: { id },
        data: safeData as Parameters<typeof tx.student.update>[0]['data'],
        select: { id: true, registrationNumber: true, enrollmentStatus: true },
      })

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'Student',
          entityId: id,
          changes: JSON.parse(JSON.stringify(safeData)),
        },
      })

      return result
    })

    return successResponse(updated, { message: 'Student profile updated successfully' })
  } catch (error) {
    console.error('[STUDENT_PATCH]', error)
    return errors.internal()
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'delete')) return errors.forbidden()

  const { id } = await params

  const student = await prisma.student.findUnique({ where: { id }, select: { id: true, userId: true } })
  if (!student) return errors.notFound('Student')

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: {
        isActive: false,
        enrollmentStatus: 'SUSPENDED',
      },
    })

    if (student.userId) {
      await tx.user.update({
        where: { id: student.userId },
        data: { isActive: false },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Student',
        entityId: id,
      },
    })
  })

  return successResponse({ id }, 'Student suspended successfully')
}
