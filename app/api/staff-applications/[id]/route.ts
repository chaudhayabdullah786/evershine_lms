/**
 * GET /api/staff-applications/[id] — Fetch application detail
 *
 * RBAC: SUPER_ADMIN | ADMIN only.
 * Auto-transitions PENDING → UNDER_REVIEW on first admin open.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) return errors.forbidden()

  const { id } = await context.params

  const application = await prisma.staffApplicationRequest.findUnique({
    where: { id },
  })
  if (!application) return errors.notFound('Staff Application')

  // Auto-transition PENDING → UNDER_REVIEW on first admin view
  if (application.status === 'PENDING') {
    await prisma.staffApplicationRequest.update({
      where: { id },
      data: { status: 'UNDER_REVIEW' },
    })
    application.status = 'UNDER_REVIEW'
  }

  return successResponse(application)
}
