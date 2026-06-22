import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const userRole = session.user.role as Role
  const userId = session.user.id

  let where: any = { entityType: 'LeaveRequest' }

  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    // Admins see all leave activity
  } else {
    const leaveIds = await prisma.leaveRequest.findMany({
      where: { applicantId: userId },
      select: { id: true },
    }).then((rows) => rows.map((row) => row.id))

    if (leaveIds.length === 0) return successResponse([])
    where.entityId = { in: leaveIds }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: 40,
    include: { user: { select: { id: true, email: true, role: true } } },
  })

  return successResponse(logs)
}
