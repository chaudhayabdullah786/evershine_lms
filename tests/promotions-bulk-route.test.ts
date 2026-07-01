import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockRequireSession, mockRequirePermission, mockPrisma } = vi.hoisted(() => {
  const mockRequireSession = vi.fn()
  const mockRequirePermission = vi.fn()
  const mockPrisma = {
    academicYear: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  }
  return { mockRequireSession, mockRequirePermission, mockPrisma }
})

vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: mockRequireSession,
  requirePermission: mockRequirePermission,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/enrollment', () => ({ autoEnrollMandatorySubjects: vi.fn() }))

import { POST } from '../app/api/promotions/bulk/route'

describe('POST /api/promotions/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ session: { user: { id: 'admin-1', role: 'SUPER_ADMIN' } }, error: null })
    mockRequirePermission.mockReturnValue(null)
    mockPrisma.academicYear.findUnique.mockResolvedValue({ id: 'cm00000000000000000000001', name: '2026-2027', isLocked: false })
  })

  it('rejects promoted rows without a target section before mutating data', async () => {
    const response = await POST(new NextRequest('http://localhost/api/promotions/bulk', {
      method: 'POST',
      body: JSON.stringify({
        fromAcademicYearId: 'cm00000000000000000000000',
        toAcademicYearId: 'cm00000000000000000000001',
        fromClassSectionId: 'cm00000000000000000000002',
        items: [
          {
            studentId: 'cm00000000000000000000003',
            status: 'PROMOTED',
            toClassSectionId: null,
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(mockPrisma.academicYear.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
