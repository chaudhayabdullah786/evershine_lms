import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockRequireSession, mockRequirePermission, mockPrisma } = vi.hoisted(() => {
  const mockRequireSession = vi.fn()
  const mockRequirePermission = vi.fn()
  const mockPrisma = {
    monthlyFeedbackCycle: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  }

  return { mockRequireSession, mockRequirePermission, mockPrisma }
})

vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: mockRequireSession,
  requirePermission: mockRequirePermission,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { PATCH } from '../app/api/feedback/admin/cycles/[id]/route'

describe('admin feedback cycle route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({
      session: { user: { id: 'admin-1', role: 'SUPER_ADMIN' } },
      error: null,
    })
    mockRequirePermission.mockReturnValue(null)
  })

  it('returns 404 instead of an uncontrolled Prisma error for a missing cycle', async () => {
    mockPrisma.monthlyFeedbackCycle.findUnique.mockResolvedValue(null)

    const response = await PATCH(
      new NextRequest('http://localhost/api/feedback/admin/cycles/clxmissing0000000001', {
        method: 'PATCH',
        body: JSON.stringify({ isOpen: false }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'clxmissing0000000001' }) }
    )

    expect(response.status).toBe(404)
    expect(mockPrisma.monthlyFeedbackCycle.update).not.toHaveBeenCalled()
  })
})
