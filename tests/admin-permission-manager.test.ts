import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindMany, mockUpsert, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rolePermission: {
      findMany: mockFindMany,
      upsert: mockUpsert,
      delete: mockDelete,
    },
  },
}))

import {
  getRolePermissionOverrides,
  getEffectivePermissionMatrix,
  upsertRolePermission,
  deleteRolePermission,
} from '@/lib/admin/permission-manager'
import type { Role } from '@prisma/client'

describe('Admin permission manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns override records from Prisma', async () => {
    const override = {
      id: 'override-1',
      role: 'ADMIN' as Role,
      resource: 'fees',
      action: 'create' as const,
      isEnabled: true,
      reason: 'Allow create fee entry',
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockFindMany.mockResolvedValue([override])

    const rows = await getRolePermissionOverrides('ADMIN')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { role: 'ADMIN' },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    })
    expect(rows).toEqual([override])
  })

  it('applies explicit deny overrides to effective permission matrix', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'override-2',
        role: 'ADMIN' as Role,
        resource: 'fees',
        action: 'create' as const,
        isEnabled: false,
        reason: 'Revoke create fees',
        createdById: 'user-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const effective = await getEffectivePermissionMatrix('ADMIN')

    expect(effective.fees).not.toContain('create')
    expect(effective.fees).toEqual(expect.arrayContaining(['read', 'update']))
  })

  it('forwards upsert and delete operations to Prisma', async () => {
    mockUpsert.mockResolvedValue({ id: 'override-3' })
    mockDelete.mockResolvedValue({ id: 'override-3' })

    const created = await upsertRolePermission({
      role: 'ADMIN',
      resource: 'attendance',
      action: 'read',
      isEnabled: true,
      reason: 'Allow attendance read for admin',
      createdById: 'admin-1',
    })

    expect(mockUpsert).toHaveBeenCalled()
    expect(created).toEqual({ id: 'override-3' })

    const deleted = await deleteRolePermission('override-3')
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'override-3' } })
    expect(deleted).toEqual({ id: 'override-3' })
  })
})
