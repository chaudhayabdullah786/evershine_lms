import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authMock,
  teacherFindUniqueMock,
  classSectionFindManyMock,
  getActiveAcademicYearMock,
  getTeacherClassSectionIdsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  teacherFindUniqueMock: vi.fn(),
  classSectionFindManyMock: vi.fn(),
  getActiveAcademicYearMock: vi.fn(),
  getTeacherClassSectionIdsMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: teacherFindUniqueMock },
    classSection: { findMany: classSectionFindManyMock },
  },
}))

vi.mock('@/lib/academic/teacher-scope', () => ({
  getTeacherClassSectionIds: getTeacherClassSectionIdsMock,
}))

vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: getActiveAcademicYearMock,
}))

import { GET } from '@/app/api/teacher-portal/sections/route'

describe('teacher-portal/sections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    getActiveAcademicYearMock.mockResolvedValue({ id: 'year-1', name: '2025-2026' })
    getTeacherClassSectionIdsMock.mockResolvedValue(['section-1'])
    classSectionFindManyMock.mockResolvedValue([
      {
        id: 'section-1',
        className: 'Class 10',
        sectionName: 'A',
        shift: { code: 'MORNING', name: 'Morning' },
        batch: { name: 'Current' },
      },
    ])
  })

  it('includes authorized migrated sections that still have active enrollments', async () => {
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(getTeacherClassSectionIdsMock).toHaveBeenCalledWith('teacher-1', 'year-1')
    expect(classSectionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['section-1'] },
          OR: [
            { isActive: true },
            {
              enrollments: {
                some: {
                  academicYearId: 'year-1',
                  status: 'ACTIVE',
                },
              },
            },
          ],
        },
      })
    )
  })

  it('does not resolve section scope for a non-teacher account', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(getTeacherClassSectionIdsMock).not.toHaveBeenCalled()
  })
})
