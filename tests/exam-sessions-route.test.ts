import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockCheckPermission, mockGetTeacherClassSectionIds, mockResolveClassContext, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockGetTeacherClassSectionIds = vi.fn()
  const mockResolveClassContext = vi.fn()
  const mockPrisma = {
    academicYear: { findMany: vi.fn() },
    teacher: { findUnique: vi.fn() },
    exam: { findMany: vi.fn() },
  }

  return { mockAuth, mockCheckPermission, mockGetTeacherClassSectionIds, mockResolveClassContext, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/teacher-scope', () => ({ getTeacherClassSectionIds: mockGetTeacherClassSectionIds }))
vi.mock('@/lib/teacher-access', () => ({ resolveClassContext: mockResolveClassContext }))

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

  it('returns only scheduled exams for sections assigned to a teacher', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockGetTeacherClassSectionIds.mockResolvedValue(['section-1'])
    mockResolveClassContext.mockResolvedValue({
      legacyClassId: 'legacy-class-1',
      classSectionId: 'section-1',
    })
    mockPrisma.exam.findMany.mockResolvedValue([{
      id: 'exam-1',
      name: 'SECOND STEP EXAM',
      classId: 'legacy-class-1',
      academicYear: '2026-2027',
      totalMarks: 60,
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      endDate: new Date('2026-08-21T00:00:00.000Z'),
      class: { name: 'Class 10 - Evening (A)' },
    }])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mockPrisma.exam.findMany).toHaveBeenCalledWith({
      where: { isActive: true, classId: { in: ['legacy-class-1'] } },
      include: { class: { select: { name: true, grade: true, section: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })
    expect(json.data).toEqual([expect.objectContaining({
      id: 'exam-1',
      name: 'SECOND STEP EXAM',
      term: '2026-2027',
      classSectionId: 'section-1',
      classLabel: 'Class 10 - Evening (A)',
      totalMarks: 60,
    })])
  })
})
