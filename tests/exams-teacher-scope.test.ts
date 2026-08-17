import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockGetSections, mockResolveContext, mockPrisma } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCheckPermission: vi.fn(),
  mockGetSections: vi.fn(),
  mockResolveContext: vi.fn(),
  mockPrisma: {
    teacher: { findUnique: vi.fn() },
    exam: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/teacher-scope', () => ({ getTeacherClassSectionIds: mockGetSections }))
vi.mock('@/lib/teacher-access', () => ({ resolveClassContext: mockResolveContext }))

import { GET } from '@/app/api/exams/route'

describe('GET /api/exams teacher scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER', campusId: 'campus-1' } })
    mockCheckPermission.mockReturnValue(true)
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockGetSections.mockResolvedValue(['section-1'])
    mockResolveContext.mockResolvedValue({ legacyClassId: 'legacy-class-1' })
    mockPrisma.exam.findMany.mockResolvedValue([])
  })

  it('limits a teacher to exams bridged from assigned sections', async () => {
    const response = await GET(new NextRequest('http://localhost/api/exams'))

    expect(response.status).toBe(200)
    expect(mockPrisma.exam.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ classId: { in: ['legacy-class-1'] } }),
    }))
  })

  it('returns no exams when a teacher requests an unassigned legacy class filter', async () => {
    const response = await GET(new NextRequest('http://localhost/api/exams?classId=other-class'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([])
    expect(mockPrisma.exam.findMany).not.toHaveBeenCalled()
  })
})
