import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockRequireSession, mockRequirePermission, mockPrisma } = vi.hoisted(() => {
  const mockRequireSession = vi.fn()
  const mockRequirePermission = vi.fn()

  const mockPrisma = {
    classSection: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return { mockRequireSession, mockRequirePermission, mockPrisma }
})

vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: mockRequireSession,
  requirePermission: mockRequirePermission,
  campusScope: vi.fn(() => undefined),
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST } from '../app/api/class-sections/route'

describe('POST /api/class-sections', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockRequireSession.mockResolvedValue({
      session: {
        user: { id: 'admin-1', role: 'ADMIN', campusId: 'clxcampus1234567890' },
      },
      error: null,
    })
    mockRequirePermission.mockReturnValue(null)
  })

  it('returns 409 when the class section already exists', async () => {
    mockPrisma.classSection.findFirst.mockResolvedValue({ id: 'existing-section' })

    const response = await POST(
      new NextRequest('http://localhost/api/class-sections', {
        method: 'POST',
        body: JSON.stringify({
          campusId: 'clxcampus1234567890',
          batchId: 'clxbatch1234567890',
          shiftId: 'clxshift1234567890',
          className: 'Class 9',
          sectionName: 'A',
          grade: 9,
          deliveryMode: 'PHYSICAL',
          curriculumMode: 'FIXED',
          capacity: 40,
        }),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json.error.message).toContain('already exists')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
