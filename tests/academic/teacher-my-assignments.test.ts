import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const {
  authMock,
  teacherFindUniqueMock,
  classSectionFindManyMock,
  subjectOfferingFindManyMock,
  timetableSlotFindManyMock,
  getActiveAcademicYearMock,
  getTeacherClassSectionIdsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  teacherFindUniqueMock: vi.fn(),
  classSectionFindManyMock: vi.fn(),
  subjectOfferingFindManyMock: vi.fn(),
  timetableSlotFindManyMock: vi.fn(),
  getActiveAcademicYearMock: vi.fn(),
  getTeacherClassSectionIdsMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: teacherFindUniqueMock },
    classSection: { findMany: classSectionFindManyMock },
    subjectOffering: { findMany: subjectOfferingFindManyMock },
    timetableSlot: { findMany: timetableSlotFindManyMock },
  },
}))

vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: getActiveAcademicYearMock,
}))

vi.mock('@/lib/academic/teacher-scope', () => ({
  getTeacherClassSectionIds: getTeacherClassSectionIdsMock,
}))

import { GET } from '@/app/api/teacher-portal/my-assignments/route'

describe('teacher-portal/my-assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock
      .mockResolvedValueOnce({ id: 'teacher-1' })
      .mockResolvedValueOnce({
        id: 'teacher-1',
        employeeId: 'ESA-T-001',
        firstName: 'Ali',
        lastName: 'Aslam',
        email: 'ali.teacher@example.test',
        profilePicture: 'https://cdn.example.test/teacher.webp',
        user: {
          displayName: 'Ali Aslam',
          email: 'ali.user@example.test',
          profilePictureUrl: null,
        },
      })
    getActiveAcademicYearMock.mockResolvedValue({ id: 'year-1', name: '2025-2026' })
    getTeacherClassSectionIdsMock.mockResolvedValue(['sec-1', 'sec-2'])
    classSectionFindManyMock.mockResolvedValue([
      {
        id: 'sec-1',
        className: 'Class 10',
        sectionName: 'Jun',
        grade: 10,
        deliveryMode: 'PHYSICAL',
        shift: { code: 'MORNING', name: 'Morning Shift' },
        campus: { name: 'College Boys Campus', code: 'CBC' },
        batch: { name: 'Iqbal' },
        _count: { enrollments: 20 },
      },
      {
        id: 'sec-2',
        className: 'Class 11',
        sectionName: 'A',
        grade: 11,
        deliveryMode: 'PHYSICAL',
        shift: { code: 'EVENING', name: 'Evening Shift' },
        campus: { name: 'College Boys Campus', code: 'CBC' },
        batch: { name: 'Quaid' },
        _count: { enrollments: 22 },
      },
    ])
    subjectOfferingFindManyMock.mockResolvedValue([
      {
        id: 'offering-1',
        classSectionId: 'sec-1',
        subject: { name: 'Physics', code: 'PHY' },
      },
    ])
    timetableSlotFindManyMock.mockResolvedValue([
      {
        classSectionId: 'sec-2',
        subjectOffering: {
          subject: { name: 'Biology', code: 'BIO' },
        },
      },
    ])
  })

  it('uses the shared teacher section scope and returns profile, shifts, batches, and subjects', async () => {
    const response = await GET(
      new Request('http://localhost/api/teacher-portal/my-assignments') as unknown as NextRequest
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(getTeacherClassSectionIdsMock).toHaveBeenCalledWith('teacher-1', 'year-1')
    expect(classSectionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['sec-1', 'sec-2'] },
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
        select: expect.objectContaining({
          _count: {
            select: {
              enrollments: {
                where: {
                  academicYearId: 'year-1',
                  status: 'ACTIVE',
                },
              },
            },
          },
        }),
      })
    )
    expect(json.data.teacher).toMatchObject({
      name: 'Ali Aslam',
      employeeId: 'ESA-T-001',
      profilePicture: 'https://cdn.example.test/teacher.webp',
    })
    expect(json.data.totalSections).toBe(2)
    expect(json.data.totalStudents).toBe(42)
    expect(json.data.activeShifts).toEqual(['MORNING', 'EVENING'])
    expect(json.data.shifts[0].sections[0]).toMatchObject({
      classSectionId: 'sec-1',
      subject: 'Physics',
      batchName: 'Iqbal',
    })
    expect(json.data.shifts[1].sections[0]).toMatchObject({
      classSectionId: 'sec-2',
      subject: 'Biology',
      batchName: 'Quaid',
    })
  })
})
