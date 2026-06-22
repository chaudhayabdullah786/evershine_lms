import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate, mockFindMany, mockUpdate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    roleAssumption: {
      create: mockCreate,
      findMany: mockFindMany,
      update: mockUpdate,
    },
  },
}))

import {
  createRoleAssumption,
  getActiveRoleAssumptions,
  revokeRoleAssumption,
} from '@/lib/admin/role-assumption'
import type { Role } from '@prisma/client'

describe('Admin role assumption service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new role assumption record', async () => {
    const created = { id: 'assumption-1', requesterId: 'admin-1' }
    mockCreate.mockResolvedValue(created)

    const result = await createRoleAssumption({
      requesterId: 'admin-1',
      originalRole: 'ADMIN' as Role,
      assumedRole: 'TEACHER' as Role,
      reason: 'Support troubleshooting',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        requesterId: 'admin-1',
        originalRole: 'ADMIN',
        assumedRole: 'TEACHER',
        reason: 'Support troubleshooting',
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
    })
    expect(result).toEqual(created)
  })

  it('returns active role assumptions for a requester', async () => {
    const assumptions = [
      { id: 'assumption-2', requesterId: 'admin-2', isActive: true },
    ]
    mockFindMany.mockResolvedValue(assumptions)

    const result = await getActiveRoleAssumptions('admin-2')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        requesterId: 'admin-2',
        isActive: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    })
    expect(result).toEqual(assumptions)
  })

  it('deactivates an existing role assumption', async () => {
    const updated = { id: 'assumption-3', isActive: false }
    mockUpdate.mockResolvedValue(updated)

    const result = await revokeRoleAssumption('assumption-3')

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'assumption-3' },
      data: {
        isActive: false,
        updatedAt: expect.any(Date),
      },
    })
    expect(result).toEqual(updated)
  })
})
