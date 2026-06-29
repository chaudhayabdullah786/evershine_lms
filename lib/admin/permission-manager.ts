import { prisma } from '@/lib/prisma'
import type { Role } from '@prisma/client'
import type { AcademicResource, Action } from '@/lib/rbac'
import { DEFAULT_PERMISSION_MATRIX } from '@/lib/rbac'

export type RolePermissionOverride = {
  id: string
  role: Role
  resource: string
  action: Action
  isEnabled: boolean
  reason: string | null
  createdById: string
  createdAt: Date
  updatedAt: Date
}

export type PermissionMatrix = Record<string, Action[]>

function isAction(value: string): value is Action {
  return value === 'create' || value === 'read' || value === 'update' || value === 'delete'
}

export const ACADEMIC_RESOURCES = Object.keys(
  DEFAULT_PERMISSION_MATRIX.SUPER_ADMIN
) as AcademicResource[]

export async function getRolePermissionOverrides(role: Role) {
  return prisma.rolePermission.findMany({
    where: { role },
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  })
}

export async function getPermissionMatrix() {
  const roles = Object.keys(DEFAULT_PERMISSION_MATRIX) as Role[]
  const matrix: Record<Role, PermissionMatrix> = {} as Record<Role, PermissionMatrix>

  for (const role of roles) {
    matrix[role] = Object.fromEntries(
      Object.entries(DEFAULT_PERMISSION_MATRIX[role]).map(([resource, actions]) => [resource, [...actions]])
    )
  }

  const overrides = await prisma.rolePermission.findMany({
    orderBy: [{ role: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
  })

  for (const override of overrides) {
    if (!isAction(override.action)) continue
    const current = matrix[override.role] ?? {}
    const actions = new Set(current[override.resource] ?? [])
    if (override.isEnabled) {
      actions.add(override.action)
    } else {
      actions.delete(override.action)
    }
    current[override.resource] = [...actions].sort()
    matrix[override.role] = current
  }

  return matrix
}

export async function getEffectivePermissionMatrix(role: Role) {
  const baseMatrix = Object.fromEntries(
    Object.entries(DEFAULT_PERMISSION_MATRIX[role] ?? {}).map(([resource, actions]) => [resource, [...actions]])
  ) as PermissionMatrix

  const overrides = await getRolePermissionOverrides(role)
  for (const override of overrides) {
    if (!isAction(override.action)) continue
    const actions = new Set(baseMatrix[override.resource] ?? [])
    if (override.isEnabled) {
      actions.add(override.action)
    } else {
      actions.delete(override.action)
    }
    baseMatrix[override.resource] = [...actions].sort()
  }

  return baseMatrix
}

export async function upsertRolePermission(params: {
  role: Role
  resource: string
  action: Action
  isEnabled: boolean
  reason?: string | null
  createdById: string
}) {
  return prisma.rolePermission.upsert({
    where: {
      role_resource_action: {
        role: params.role,
        resource: params.resource,
        action: params.action,
      },
    },
    create: {
      role: params.role,
      resource: params.resource,
      action: params.action,
      isEnabled: params.isEnabled,
      reason: params.reason ?? null,
      createdById: params.createdById,
    },
    update: {
      isEnabled: params.isEnabled,
      reason: params.reason ?? null,
      createdById: params.createdById,
    },
  })
}

export async function deleteRolePermission(id: string) {
  return prisma.rolePermission.delete({ where: { id } })
}
