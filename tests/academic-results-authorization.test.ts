import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAuth,
  mockGetStudentTermResults,
  mockPrisma,
  mockGuardianAccess,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetStudentTermResults: vi.fn(),
  mockPrisma: {
    student: { findUnique: vi.fn() },
    teacher: { findUnique: vi.fn() },
    studentEnrollment: { findFirst: vi.fn() },
  },
  mockGuardianAccess: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/services/academic-upgrades-service', () => ({
  AcademicUpgradesService: {
    getStudentTermResults: mockGetStudentTermResults,
    getClassResultsSheet: vi.fn(),
  },
}))
vi.mock('@/lib/academic/guardian', () => ({
  assertGuardianAccessToStudent: mockGuardianAccess,
}))
vi.mock('@/lib/academic/teacher-scope', () => ({
  getTeacherClassSectionIds: vi.fn().mockResolvedValue(['section-1']),
}))

import { GET } from '@/app/api/academic-upgrades/results/route'

describe('academic result read authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStudentTermResults.mockResolvedValue([])
  })

  it('allows a student to read only their own declared results', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'student-user-1', role: 'STUDENT' } })
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'student-1' })

    const response = await GET(
      new Request('http://localhost/api/academic-upgrades/results?studentId=student-1') as never
    )

    expect(response.status).toBe(200)
    expect(mockGetStudentTermResults).toHaveBeenCalledWith('student-1', undefined, true)
  })

  it('rejects a student requesting another student result card', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'student-user-1', role: 'STUDENT' } })
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'student-1' })

    const response = await GET(
      new Request('http://localhost/api/academic-upgrades/results?studentId=student-2') as never
    )

    expect(response.status).toBe(403)
    expect(mockGetStudentTermResults).not.toHaveBeenCalled()
  })

  it('requires a parent result request to target a linked child', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'parent-user-1', role: 'PARENT' } })
    mockGuardianAccess.mockResolvedValue(false)

    const response = await GET(
      new Request('http://localhost/api/academic-upgrades/results?studentId=student-2') as never
    )

    expect(response.status).toBe(403)
    expect(mockGuardianAccess).toHaveBeenCalledWith('parent-user-1', 'student-2')
    expect(mockGetStudentTermResults).not.toHaveBeenCalled()
  })

  it('prevents students from reading an entire class result sheet', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'student-user-1', role: 'STUDENT' } })

    const response = await GET(
      new Request(
        'http://localhost/api/academic-upgrades/results?classSectionId=section-1&examSessionId=exam-1'
      ) as never
    )

    expect(response.status).toBe(403)
  })
})
