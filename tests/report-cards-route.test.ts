import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockRequirePermission, mockBuildReportCard, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockRequirePermission = vi.fn()
  const mockBuildReportCard = vi.fn()
  const mockPrisma = {
    studentEnrollment: { findMany: vi.fn(), findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
  }
  return { mockAuth, mockRequirePermission, mockBuildReportCard, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: vi.fn(),
  requirePermission: mockRequirePermission,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/report-card', () => ({ buildReportCardForEnrollment: mockBuildReportCard }))
vi.mock('@/lib/academic/guardian', () => ({ assertGuardianAccessToStudent: vi.fn() }))

import { GET } from '../app/api/report-cards/route'

describe('GET /api/report-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockRequirePermission.mockReturnValue(null)
    mockPrisma.studentEnrollment.findMany.mockResolvedValue([
      { id: 'enroll-promoted', status: 'PROMOTED' },
      { id: 'enroll-graduated', status: 'GRADUATED' },
    ])
    mockBuildReportCard.mockResolvedValue({
      studentName: 'Ali Student',
      fatherName: 'Parent',
      className: 'Grade 10-A',
      rollNo: '10',
      registrationNumber: 'REG-10',
      session: '2025-2026',
      subjects: [{ subject: 'Math', marks: 90, maxMarks: 100, grade: 'A', status: 'PASS' }],
      totalObtained: 90,
      totalPossible: 100,
      percentage: 90,
      overallGrade: 'A',
      attendancePct: 95,
    })
  })

  it('includes completed-year enrollments after promotions when exporting class report cards', async () => {
    const response = await GET(new NextRequest('http://localhost/api/report-cards?academicYearId=year-1&classSectionId=section-1'))

    expect(response.status).toBe(200)
    expect(mockPrisma.studentEnrollment.findMany).toHaveBeenCalledWith({
      where: {
        classSectionId: 'section-1',
        academicYearId: 'year-1',
        status: { in: ['ACTIVE', 'PROMOTED', 'RETAINED', 'TRANSFERRED', 'GRADUATED'] },
      },
      orderBy: { rollNumber: 'asc' },
    })
    expect(mockBuildReportCard).toHaveBeenCalledWith('enroll-promoted')
    expect(mockBuildReportCard).toHaveBeenCalledWith('enroll-graduated')
  })
})
