import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockGetActiveAcademicYear, mockGetTeacherSections, mockPrisma } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetActiveAcademicYear: vi.fn(),
  mockGetTeacherSections: vi.fn(),
  mockPrisma: { 
    teacher: { findUnique: vi.fn() },
    academicYear: { findMany: vi.fn() }
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: mockGetActiveAcademicYear }))
vi.mock('@/lib/academic/teacher-scope', () => ({ getTeacherClassSectionIds: mockGetTeacherSections }))

import { GET } from '@/app/api/teacher-portal/result-sessions/route'

describe('GET /api/teacher-portal/result-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockGetActiveAcademicYear.mockResolvedValue({ id: 'year-1', name: '2026-2027' })
    mockPrisma.academicYear.findMany.mockResolvedValue([{ id: 'year-1', name: '2026-2027', isActive: true }])
    mockGetTeacherSections.mockResolvedValue(['section-1'])
  })

  it('returns the active result cycle for an assigned teacher', async () => {
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([expect.objectContaining({
      id: 'year-1',
      name: '2026-2027 — Annual Result (Active)',
      type: 'ANNUAL',
      status: 'OPEN',
      sectionCount: 1,
    })])
    expect(mockGetTeacherSections).toHaveBeenCalledWith('teacher-1', 'year-1')
  })

  it('does not expose a result cycle when the teacher has no assigned sections', async () => {
    mockGetTeacherSections.mockResolvedValue([])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([])
  })
})
