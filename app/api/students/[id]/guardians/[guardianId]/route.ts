import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'update')) return errors.forbidden()

  const { id: studentId, guardianId } = await params

  const link = await prisma.student.findFirst({
    where: { id: studentId, guardians: { some: { id: guardianId } } },
    select: { id: true },
  })
  if (!link) return errors.notFound('Guardian link')

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: studentId },
      data: { guardians: { disconnect: { id: guardianId } } },
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Student',
        entityId: studentId,
        changes: { guardianUnlinked: guardianId },
      },
    })
  })

  return successResponse({ studentId, guardianId }, { message: 'Guardian unlinked from student' })
}
