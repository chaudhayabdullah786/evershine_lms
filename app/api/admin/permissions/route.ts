/**
 * Admin permission matrix management API.
 *
 * This route grants administrator users the ability to create permission
 * overrides and review effective permission matrices without leaking
 * system configuration to non-admin users.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { DEFAULT_PERMISSION_MATRIX } from '@/lib/rbac'
import { logAudit } from '@/lib/audit-logger'
import {
  getPermissionMatrix,
  upsertRolePermission,
  deleteRolePermission,
} from '@/lib/admin/permission-manager'
import { Role } from '@prisma/client'

const actionSchema = z.enum(['create', 'read', 'update', 'delete'])
const knownResources = Object.keys(DEFAULT_PERMISSION_MATRIX.SUPER_ADMIN)
const resourceSchema = z.string().refine((value) => knownResources.includes(value), {
  message: 'Invalid resource',
})
const roleSchema = z.nativeEnum(Role)

const rolePermissionPayload = z.object({
  role: roleSchema,
  resource: resourceSchema,
  action: actionSchema,
  isEnabled: z.boolean(),
  reason: z.string().max(255).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'SUPER_ADMIN') return errors.forbidden('Only Super Administrators can manage role permissions.')

  const matrix = await getPermissionMatrix()
  const overrides = await prisma.rolePermission.findMany({
    orderBy: [{ role: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
  })

  return successResponse({ matrix, overrides })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'SUPER_ADMIN') return errors.forbidden('Only Super Administrators can manage role permissions.')

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errors.badRequest('Invalid JSON payload')
  }

  const parsed = rolePermissionPayload.safeParse(payload)
  if (!parsed.success) {
    return errors.validation(parsed.error)
  }

  const updatedPermission = await upsertRolePermission({
    role: parsed.data.role,
    resource: parsed.data.resource,
    action: parsed.data.action,
    isEnabled: parsed.data.isEnabled,
    reason: parsed.data.reason,
    createdById: session.user.id,
  })

  await logAudit({
    prismaClient: prisma,
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'RolePermission',
    entityId: updatedPermission.id,
    changes: {
      role: parsed.data.role,
      resource: parsed.data.resource,
      action: parsed.data.action,
      isEnabled: parsed.data.isEnabled,
      reason: parsed.data.reason ?? null,
    },
    request,
  })

  return successResponse(updatedPermission, 'Permission override saved successfully.')
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'SUPER_ADMIN') return errors.forbidden('Only Super Administrators can manage role permissions.')

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errors.badRequest('Invalid JSON payload')
  }

  const idSchema = z.object({ id: z.string().min(1) })
  const parsed = idSchema.safeParse(payload)
  if (!parsed.success) return errors.validation(parsed.error)

  const existing = await prisma.rolePermission.findUnique({ where: { id: parsed.data.id } })
  if (!existing) return errors.notFound('Permission override not found.')

  const deleted = await deleteRolePermission(parsed.data.id)

  await logAudit({
    prismaClient: prisma,
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'RolePermission',
    entityId: deleted.id,
    changes: {
      role: deleted.role,
      resource: deleted.resource,
      action: deleted.action,
      isEnabled: deleted.isEnabled,
      reason: deleted.reason,
    },
    request,
  })

  return successResponse(deleted, 'Permission override removed successfully.')
}
