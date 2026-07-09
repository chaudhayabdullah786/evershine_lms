import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    studentEnrollment: { findMany: vi.fn() },
    subjectOffering: { findMany: vi.fn() },
    dailyPerformanceScore: { findMany: vi.fn() },
  }
  return { mockAuth, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET } from '../app/api/teacher-portal/monthly-monitoring/route'

describe('GET /api/teacher-portal/monthly-monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.studentEnrollment.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        rollNumber: '2100',
        student: {
          id: 'student-1',
          firstName: 'Rizwan',
          lastName: 'Ali',
          fatherName: 'Nazeer Ahmad',
          rollNumber: '2100',
        },
      },
    ])
    mockPrisma.subjectOffering.findMany.mockResolvedValue([
      {
        id: 'offering-physics',
        maxDailyScore: 20,
        subject: { name: 'Physics', code: 'PHY' },
      },
      {
        id: 'offering-math',
        maxDailyScore: 20,
        subject: { name: 'Mathematics', code: 'MATH' },
      },
    ])
  })

  it('includes existing daily-score remarks in daily monitoring rows', async () => {
    mockPrisma.dailyPerformanceScore.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        subjectOfferingId: 'offering-physics',
        score: 15,
        remarks: 'Great improvement',
        date: new Date('2026-07-08T00:00:00.000Z'),
      },
      {
        studentId: 'student-1',
        subjectOfferingId: 'offering-math',
        score: 18,
        remarks: 'Excellent work',
        date: new Date('2026-07-08T00:00:00.000Z'),
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/monthly-monitoring?classSectionId=section-1&academicYearId=year-1&type=daily&date=2026-07-08'))

    expect(response.status).toBe(200)
    expect(mockPrisma.dailyPerformanceScore.findMany).toHaveBeenCalledWith({
      where: {
        studentId: { in: ['student-1'] },
        subjectOfferingId: { in: ['offering-physics', 'offering-math'] },
        date: { gte: expect.any(Date), lte: expect.any(Date) },
      },
    })
    const json = await response.json()
    expect(json.data.students[0]).toEqual(expect.objectContaining({
      studentId: 'student-1',
      obtainedMarks: 33,
      totalMarks: 40,
      remarks: 'Physics: Great improvement | Mathematics: Excellent work',
      subjectRemarks: {
        'offering-physics': ['Great improvement'],
        'offering-math': ['Excellent work'],
      },
    }))
  })

  it('deduplicates repeated monthly remarks per subject', async () => {
    mockPrisma.dailyPerformanceScore.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        subjectOfferingId: 'offering-physics',
        score: 15,
        remarks: 'Good',
        date: new Date('2026-07-08T00:00:00.000Z'),
      },
      {
        studentId: 'student-1',
        subjectOfferingId: 'offering-physics',
        score: 16,
        remarks: 'Good',
        date: new Date('2026-07-09T00:00:00.000Z'),
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/monthly-monitoring?classSectionId=section-1&academicYearId=year-1&type=monthly&month=7&year=2026'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.students[0].remarks).toBe('Physics: Good')
    expect(json.data.students[0].subjectRemarks['offering-physics']).toEqual(['Good'])
  })
})
