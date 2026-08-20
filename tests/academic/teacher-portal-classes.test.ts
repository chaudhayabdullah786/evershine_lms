import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { authMock, teacherFindUniqueMock, activeYearMock, assignmentFindManyMock, subjectOfferingFindManyMock, classSectionFindManyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  teacherFindUniqueMock: vi.fn(),
  activeYearMock: vi.fn(),
  assignmentFindManyMock: vi.fn(),
  subjectOfferingFindManyMock: vi.fn(),
  classSectionFindManyMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: activeYearMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: teacherFindUniqueMock },
    teacherSectionAssignment: { findMany: assignmentFindManyMock },
    subjectOffering: { findMany: subjectOfferingFindManyMock },
    classSection: { findMany: classSectionFindManyMock },
  },
}))

import { GET } from '@/app/api/teacher-portal/classes/route'

const section = (id: string, className = 'Class 10', sectionName = 'A') => ({
  id,
  className,
  sectionName,
  grade: 10,
  campusId: 'campus-1',
  batchId: 'batch-1',
  deliveryMode: 'PHYSICAL',
  campus: { id: 'campus-1', name: 'Main Campus', code: 'MC' },
  batch: { id: 'batch-1', name: 'Regular', code: 'REG', academicLevel: 'SECONDARY' },
  shift: { name: 'Morning', code: 'MORNING' },
  _count: { enrollments: 11 },
})

describe('teacher-portal/classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    activeYearMock.mockResolvedValue({ id: 'year-current', name: '2025-2026' })
    assignmentFindManyMock.mockResolvedValue([])
    subjectOfferingFindManyMock.mockResolvedValue([])
    classSectionFindManyMock.mockResolvedValue([])
  })

  it('returns only active canonical assignments for the logged-in teacher', async () => {
    assignmentFindManyMock.mockResolvedValue([
      {
        id: 'assignment-1',
        teacherId: 'teacher-1',
        classSectionId: 'section-10-a',
        academicYearId: 'year-current',
        isClassTeacher: true,
        status: 'ACTIVE',
        classSection: section('section-10-a'),
      },
    ])
    subjectOfferingFindManyMock.mockResolvedValue([
      { classSectionId: 'section-10-a', teacherId: 'teacher-1', subject: { id: 'subject-1', name: 'Physics', code: 'PHY' } },
    ])

    const response = await GET(new Request('http://localhost/api/teacher-portal/classes') as unknown as NextRequest)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([expect.objectContaining({
      id: 'section-10-a',
      classSectionId: 'section-10-a',
      academicYear: '2025-2026',
      isClassTeacher: true,
      subjects: [{ id: 'subject-1', name: 'Physics', code: 'PHY' }],
    })])
    expect(assignmentFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ teacherId: 'teacher-1', academicYearId: 'year-current', status: 'ACTIVE' }),
    }))
  })

  it('does not return historical subject offerings without a current assignment', async () => {
    subjectOfferingFindManyMock.mockResolvedValue([
      { classSectionId: 'old-section', teacherId: 'teacher-1', subject: { id: 'subject-old', name: 'Old', code: 'OLD' } },
    ])

    const response = await GET(new Request('http://localhost/api/teacher-portal/classes') as unknown as NextRequest)
    const json = await response.json()

    expect(json.data).toEqual([])
    expect(assignmentFindManyMock).toHaveBeenCalledTimes(1)
  })

  it('keeps subject visibility section-scoped for a subject teacher', async () => {
    assignmentFindManyMock.mockResolvedValue([
      {
        id: 'assignment-2',
        teacherId: 'teacher-1',
        classSectionId: 'section-11-b',
        academicYearId: 'year-current',
        isClassTeacher: false,
        status: 'ACTIVE',
        classSection: section('section-11-b', 'Class 11', 'B'),
      },
    ])
    subjectOfferingFindManyMock.mockResolvedValue([
      { classSectionId: 'section-11-b', teacherId: 'teacher-2', subject: { id: 'subject-other', name: 'Chemistry', code: 'CHEM' } },
      { classSectionId: 'section-11-b', teacherId: 'teacher-1', subject: { id: 'subject-own', name: 'Biology', code: 'BIO' } },
    ])

    const response = await GET(new Request('http://localhost/api/teacher-portal/classes') as unknown as NextRequest)
    const json = await response.json()

    expect(json.data[0].subjects).toEqual([{ id: 'subject-own', name: 'Biology', code: 'BIO' }])
  })
})
