/**
 * Admin role assumption workflow.
 *
 * Allows administrators to create temporary role assumptions for support and
 * troubleshooting use cases, while writing an audit record for compliance.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { ADMIN_ROLES } from '@/lib/rbac'
import { logAudit } from '@/lib/audit-logger'
import {
  createRoleAssumption,
  getActiveRoleAssumptions,
  getRoleAssumptionById,
  revokeRoleAssumption,
} from '@/lib/admin/role-assumption'
import { Role } from '@prisma/client'

const roleSchema = z.nativeEnum(Role)
const roleAssumptionPayload = z.object({
  assumedRole: roleSchema,
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!ADMIN_ROLES.includes(session.user.role)) return errors.forbidden()

  const assumptions = await getActiveRoleAssumptions(session.user.id)
  return successResponse({ assumptions })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!ADMIN_ROLES.includes(session.user.role)) return errors.forbidden()

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errors.badRequest('Invalid JSON payload')
  }

  const parsed = roleAssumptionPayload.safeParse(payload)
  if (!parsed.success) {
    return errors.validation(parsed.error)
  }

  if (parsed.data.assumedRole === session.user.role) {
    return errors.badRequest('Assumed role must differ from the current administrative role.')
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined
  const assumption = await createRoleAssumption({
    requesterId: session.user.id,
    originalRole: session.user.role,
    assumedRole: parsed.data.assumedRole,
    reason: parsed.data.reason ?? null,
    expiresAt,
  })

  await logAudit({
    prismaClient: prisma,
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'RoleAssumption',
    entityId: assumption.id,
    changes: {
      originalRole: session.user.role,
      assumedRole: assumption.assumedRole,
      expiresAt: assumption.expiresAt?.toISOString() ?? null,
      reason: assumption.reason,
    },
    request,
  })

  return successResponse(assumption, 'Role assumption created successfully.')
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!ADMIN_ROLES.includes(session.user.role)) return errors.forbidden()

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errors.badRequest('Invalid JSON payload')
  }

  const idSchema = z.object({ id: z.string().uuid() })
  const parsed = idSchema.safeParse(payload)
  if (!parsed.success) return errors.validation(parsed.error)

  const existing = await getRoleAssumptionById(parsed.data.id)
  if (!existing) return errors.notFound('Role assumption not found.')
  if (existing.requesterId !== session.user.id) {
    return errors.forbidden('You may only revoke your own role assumptions.')
  }

  const revoked = await revokeRoleAssumption(parsed.data.id)

  await logAudit({
    prismaClient: prisma,
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'RoleAssumption',
    entityId: revoked.id,
    changes: {
      originalRole: revoked.originalRole,
      assumedRole: revoked.assumedRole,
      expiresAt: revoked.expiresAt?.toISOString() ?? null,
      reason: revoked.reason,
      isActive: revoked.isActive,
    },
    request,
  })

  return successResponse(revoked, 'Role assumption revoked successfully.')
}
