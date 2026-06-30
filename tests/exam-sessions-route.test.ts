import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockCheckPermission, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockPrisma = {
    academicYear: { findMany: vi.fn() },
  }

  return { mockAuth, mockCheckPermission, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET } from '../app/api/exam-sessions/route'

describe('GET /api/exam-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockCheckPermission.mockReturnValue(true)
  })

  it('returns academic years as stable exam-session options', async () => {
    mockPrisma.academicYear.findMany.mockResolvedValue([
      { id: 'clxactiveyear1234567890', name: '2026-2027', isActive: true },
      { id: 'clxoldyear123456789000', name: '2025-2026', isActive: false },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mockCheckPermission).toHaveBeenCalledWith('SUPER_ADMIN', 'exams', 'read')
    expect(mockPrisma.academicYear.findMany).toHaveBeenCalledWith({
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
      select: { id: true, name: true, isActive: true },
    })
    const json = await response.json()
    expect(json.data).toEqual([
      { id: 'clxactiveyear1234567890', name: '2026-2027 (Active)', term: 'ACTIVE_YEAR' },
      { id: 'clxoldyear123456789000', name: '2025-2026', term: 'ACADEMIC_YEAR' },
    ])
  })

  it('rejects users without exams read access', async () => {
    mockCheckPermission.mockReturnValue(false)

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mockPrisma.academicYear.findMany).not.toHaveBeenCalled()
  })
})
