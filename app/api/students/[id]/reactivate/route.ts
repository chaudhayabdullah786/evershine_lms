import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'update')) return errors.forbidden()

  const { id } = await params

  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, userId: true, enrollmentStatus: true },
  })
  if (!student) return errors.notFound('Student')

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: {
        isActive: true,
        enrollmentStatus: 'ACTIVE',
      },
    })

    if (student.userId) {
      await tx.user.update({
        where: { id: student.userId },
        data: { isActive: true },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Student',
        entityId: id,
        changes: { reactivated: true },
      },
    })
  })

  return successResponse({ id }, { message: 'Student reactivated successfully' })
}
