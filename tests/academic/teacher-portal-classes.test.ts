import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const {
  authMock,
  teacherFindUniqueMock,
  academicYearFindFirstMock,
  classTeacherFindManyMock,
  subjectTeacherFindManyMock,
  timetableSlotFindManyMock,
  subjectOfferingFindManyMock,
  classFindFirstMock,
  classSectionFindManyMock,
  teacherClassSectionIdsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  teacherFindUniqueMock: vi.fn(),
  academicYearFindFirstMock: vi.fn(),
  classTeacherFindManyMock: vi.fn(),
  subjectTeacherFindManyMock: vi.fn(),
  timetableSlotFindManyMock: vi.fn(),
  subjectOfferingFindManyMock: vi.fn(),
  classFindFirstMock: vi.fn(),
  classSectionFindManyMock: vi.fn(),
  teacherClassSectionIdsMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}))

vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: academicYearFindFirstMock,
}))

vi.mock('@/lib/academic/teacher-scope', () => ({
  getTeacherClassSectionIds: teacherClassSectionIdsMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: teacherFindUniqueMock },
    academicYear: { findFirst: academicYearFindFirstMock },
    classTeacher: { findMany: classTeacherFindManyMock },
    subjectTeacher: { findMany: subjectTeacherFindManyMock },
    timetableSlot: { findMany: timetableSlotFindManyMock },
    subjectOffering: { findMany: subjectOfferingFindManyMock },
    class: { findFirst: classFindFirstMock },
    classSection: { findMany: classSectionFindManyMock },
  },
}))

import { GET } from '@/app/api/teacher-portal/classes/route'

describe('teacher-portal/classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only the active academic year classes for the logged-in teacher', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    academicYearFindFirstMock.mockResolvedValue({ id: 'year-current', name: '2025-2026' })

    classTeacherFindManyMock.mockResolvedValue([
      {
        isClassTeacher: true,
        class: {
          id: 'legacy-class-1',
          name: 'Class 10-A',
          section: 'A',
          grade: 10,
          shift: 'MORNING',
          batchId: 'batch-1',
          campusId: 'campus-1',
          academicYear: '2025-2026',
          campus: { name: 'Main Campus', code: 'MC' },
          batch: { name: 'Regular', code: 'REG', academicLevel: 'SECONDARY' },
        },
      },
      {
        isClassTeacher: false,
        class: {
          id: 'legacy-class-old',
          name: 'Class 10-A',
          section: 'A',
          grade: 10,
          shift: 'MORNING',
          batchId: 'batch-1',
          campusId: 'campus-1',
          academicYear: '2024-2025',
          campus: { name: 'Main Campus', code: 'MC' },
          batch: { name: 'Regular', code: 'REG', academicLevel: 'SECONDARY' },
        },
      },
    ])
    subjectTeacherFindManyMock.mockResolvedValue([])
    timetableSlotFindManyMock.mockResolvedValue([])
    subjectOfferingFindManyMock.mockResolvedValue([])

    const response = await GET(new Request('http://localhost/api/teacher-portal/classes') as unknown as NextRequest)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].legacyClassId).toBe('legacy-class-1')
    expect(classTeacherFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teacherId: 'teacher-1', academicYear: '2025-2026' }),
      })
    )
  })

  it('preserves the current ClassSection ID when it merges with a legacy assignment', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    academicYearFindFirstMock.mockResolvedValue({ id: 'year-current', name: '2025-2026' })
    classTeacherFindManyMock.mockResolvedValue([
      {
        isClassTeacher: true,
        class: {
          id: 'legacy-class-1', name: 'Class 10-A', section: 'A', grade: 10,
          shift: 'MORNING', batchId: 'batch-1', campusId: 'campus-1', academicYear: '2025-2026',
          campus: { name: 'Main Campus', code: 'MC' },
          batch: { name: 'Regular', code: 'REG', academicLevel: 'SECONDARY' },
        },
      },
    ])
    subjectTeacherFindManyMock.mockResolvedValue([])
    timetableSlotFindManyMock.mockResolvedValue([])
    subjectOfferingFindManyMock.mockResolvedValue([
      {
        subject: { id: 'subject-1', name: 'Physics', code: 'PHY' },
        classSection: {
          id: 'section-10-a', className: 'Class 10', sectionName: 'A', grade: 10,
          shiftId: 'shift-1', batchId: 'batch-1', campusId: 'campus-1',
          shift: { name: 'Morning', code: 'MORNING' },
          campus: { name: 'Main Campus', code: 'MC' },
          batch: { name: 'Regular', code: 'REG', academicLevel: 'SECONDARY' },
        },
      },
    ])
    classFindFirstMock.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/teacher-portal/classes') as unknown as NextRequest)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(json.data[0]).toMatchObject({
      legacyClassId: 'legacy-class-1',
      classSectionId: 'section-10-a',
    })
  })

  it('falls back to canonical section assignments when legacy class rows are unavailable', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    academicYearFindFirstMock.mockResolvedValue({ id: 'year-current', name: '2025-2026' })
    classTeacherFindManyMock.mockResolvedValue([])
    subjectTeacherFindManyMock.mockResolvedValue([])
    timetableSlotFindManyMock.mockResolvedValue([])
    subjectOfferingFindManyMock
      .mockResolvedValueOnce([]) // teacher-owned offerings
      .mockResolvedValueOnce([]) // all-offerings fallback
      .mockResolvedValueOnce([{ // canonical active-year offerings
        classSectionId: 'section-11-a',
        subject: { id: 'subject-bio', name: 'Biology', code: 'BIO' },
      }])
    classFindFirstMock.mockResolvedValue(null)
    teacherClassSectionIdsMock.mockResolvedValue(['section-11-a'])
    classSectionFindManyMock.mockResolvedValue([{
      id: 'section-11-a',
      className: 'Class 11',
      sectionName: 'A',
      grade: 11,
      campusId: 'campus-1',
      batchId: 'batch-1',
      shift: { name: 'Morning', code: 'MORNING' },
      campus: { name: 'Main Campus', code: 'MC' },
      batch: { name: 'Regular', code: 'REG', academicLevel: 'SECONDARY' },
    }])

    const response = await GET(new Request('http://localhost/api/teacher-portal/classes') as unknown as NextRequest)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([expect.objectContaining({
      id: 'section-11-a',
      classSectionId: 'section-11-a',
      legacyClassId: null,
      subjects: [{ id: 'subject-bio', name: 'Biology', code: 'BIO' }],
    })])
  })
})
