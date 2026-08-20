import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma, mockAcademicYearFindUnique, mockAssignmentFindMany } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockAcademicYearFindUnique = vi.fn()
  const mockAssignmentFindMany = vi.fn()
  const mockPrisma = {
    teacher: { findUnique: vi.fn() },
    academicYear: { findUnique: mockAcademicYearFindUnique },
    teacherSectionAssignment: { findMany: mockAssignmentFindMany },
    studentEnrollment: { findMany: vi.fn() },
    subjectOffering: { findMany: vi.fn(), findFirst: vi.fn() },
    dailyPerformanceScore: { findMany: vi.fn() },
    monthlyMonitoringReport: { upsert: vi.fn(), findUnique: vi.fn() },
  }
  return { mockAuth, mockPrisma, mockAcademicYearFindUnique, mockAssignmentFindMany }
})

const getOrSyncSectionEnrollmentsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/roster-helper', () => ({ getOrSyncSectionEnrollments: getOrSyncSectionEnrollmentsMock }))

import { GET } from '@/app/api/teacher-portal/monthly-monitoring/route'

describe('GET /api/teacher-portal/monthly-monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockAcademicYearFindUnique.mockResolvedValue({ id: 'year-1', name: '2026-2027' })
    mockAssignmentFindMany.mockResolvedValue([{ classSectionId: 'section-1' }])
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
        classSectionId: 'section-1',
        maxDailyScore: 20,
        subject: { name: 'Physics', code: 'PHY' },
      },
    ])
    mockPrisma.monthlyMonitoringReport.findUnique.mockResolvedValue(null)
    getOrSyncSectionEnrollmentsMock.mockResolvedValue({
      enrollments: [{
        studentId: 'student-1',
        student: {
          id: 'student-1',
          firstName: 'Rizwan',
          lastName: 'Ali',
          fatherName: 'Nazeer Ahmad',
          rollNumber: '2100',
        },
      }],
    })
  })

  it('returns qualitative daily labels and remarks only for the assigned teacher subject', async () => {
    mockPrisma.dailyPerformanceScore.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        subjectOfferingId: 'offering-physics',
        score: 16,
        remarks: '__MONITORING_META__:{"grade":"GOOD","remarks":"Good participation","isStarOfDay":true,"isConcern":false}',
        date: new Date('2026-07-08T00:00:00.000Z'),
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/monthly-monitoring?classSectionId=section-1&academicYearId=year-1&type=daily&date=2026-07-08'))

    expect(response.status).toBe(200)
    expect(mockPrisma.subjectOffering.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classSectionId: 'section-1', academicYearId: 'year-1', teacherId: 'teacher-1' },
    }))

    const json = await response.json()
    expect(json.data.students[0]).toEqual(expect.objectContaining({
      studentId: 'student-1',
      subjectGrades: { 'offering-physics': 'GOOD' },
      subjectRemarks: { 'offering-physics': ['Good participation'] },
      dailyRemarks: 'Physics: Good participation',
      isStarOfDay: true,
      isConcern: false,
    }))
  })

  it('aggregates a yearly report over the whole calendar year', async () => {
    mockPrisma.dailyPerformanceScore.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        subjectOfferingId: 'offering-physics',
        score: 20,
        remarks: 'Excellent work',
        date: new Date('2026-01-15T00:00:00.000Z'),
      },
      {
        studentId: 'student-1',
        subjectOfferingId: 'offering-physics',
        score: 16,
        remarks: 'Excellent work',
        date: new Date('2026-12-15T00:00:00.000Z'),
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/monthly-monitoring?classSectionId=section-1&academicYearId=year-1&type=yearly&year=2026'))

    expect(response.status).toBe(200)
    expect(mockPrisma.dailyPerformanceScore.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        date: {
          gte: new Date(2026, 0, 1),
          lte: new Date(2026, 11, 31, 23, 59, 59, 999),
        },
      }),
    }))

    const json = await response.json()
    expect(json.data).toEqual(expect.objectContaining({ type: 'yearly', year: 2026 }))
    expect(json.data.students[0]).toEqual(expect.objectContaining({
      obtainedMarks: 36,
      totalMarks: 40,
      percentage: 90,
      performanceBatch: 'Ever Shine Group',
      remarks: 'Physics: Excellent work',
    }))
  })

  it('denies a teacher without an assigned offering for the requested section', async () => {
    mockPrisma.subjectOffering.findMany.mockResolvedValue([])

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/monthly-monitoring?classSectionId=section-2&academicYearId=year-1&type=monthly&month=7&year=2026'))

    expect(response.status).toBe(403)
  })

  it('builds a monthly roster through the shared resolver when the selected year has no enrollment rows', async () => {
    mockPrisma.studentEnrollment.findMany.mockResolvedValueOnce([])

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/monthly-monitoring?classSectionId=section-1&academicYearId=year-1&type=monthly&month=7&year=2026'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(getOrSyncSectionEnrollmentsMock).toHaveBeenCalledWith('section-1', 'year-1')
    expect(json.data.students).toHaveLength(1)
    expect(json.data.students[0].studentId).toBe('student-1')
  })
})
