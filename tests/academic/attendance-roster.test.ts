import { describe, it, expect, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { studentEnrollmentFindMany, timetableSlotFindFirst, subjectOfferingFindFirst } = vi.hoisted(() => ({
  studentEnrollmentFindMany: vi.fn(),
  timetableSlotFindFirst: vi.fn(),
  subjectOfferingFindFirst: vi.fn(),
}))

const { requireSessionMock, requirePermissionMock, getTeacherByUserIdMock, teacherCanAccessClassSectionMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(async () => ({ session: { user: { id: 'teacher-1', role: 'TEACHER' } }, error: null })),
  requirePermissionMock: vi.fn(() => null),
  getTeacherByUserIdMock: vi.fn(async () => ({ id: 'teacher-1' })),
  teacherCanAccessClassSectionMock: vi.fn(async () => true),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    studentEnrollment: { findMany: studentEnrollmentFindMany },
    timetableSlot: { findFirst: timetableSlotFindFirst },
    subjectOffering: { findFirst: subjectOfferingFindFirst },
  },
}))

vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: vi.fn(async () => ({ id: 'year-1' })),
}))

vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: requireSessionMock,
  requirePermission: requirePermissionMock,
}))

vi.mock('@/lib/academic/teacher-scope', async () => {
  const actual = await vi.importActual<typeof import('@/lib/academic/teacher-scope')>('@/lib/academic/teacher-scope')
  return {
    ...actual,
    getTeacherByUserId: getTeacherByUserIdMock,
    teacherCanAccessClassSection: teacherCanAccessClassSectionMock,
  }
})

import { GET } from '@/app/api/enrollment-attendance/roster/route'

describe('attendance roster API', () => {
  it('allows teachers with valid access to fetch roster', async () => {
    teacherCanAccessClassSectionMock.mockResolvedValue(true)
    timetableSlotFindFirst.mockResolvedValue({ id: 'slot-1' })
    subjectOfferingFindFirst.mockResolvedValue(null)
    studentEnrollmentFindMany.mockResolvedValue([
      {
        id: 'enroll-1',
        rollNumber: '123',
        student: { id: 'student-1', firstName: 'John', lastName: 'Doe' },
        classSection: { batch: { id: 'batch-1', name: 'Batch A' }, shift: { id: 'shift-1', name: 'Morning' } },
        attendanceRecords: [],
      },
    ])

    const request = new Request('http://localhost/api/enrollment-attendance/roster?classSectionId=section-1', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    })

    const response = await GET(request as unknown as NextRequest)
    const json = await response.json()

    expect(json.success).toBe(true)
    expect(json.data.enrollments).toHaveLength(1)
    expect(json.data.enrollments[0].student.firstName).toBe('John')
  })

  it('denies access for teachers without valid access', async () => {
    teacherCanAccessClassSectionMock.mockResolvedValue(false)
    timetableSlotFindFirst.mockResolvedValue(null)
    subjectOfferingFindFirst.mockResolvedValue(null)

    const request = new Request('http://localhost/api/enrollment-attendance/roster?classSectionId=section-1', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    })

    const response = await GET(request as unknown as NextRequest)
    const json = await response.json()

    expect(json.success).toBe(false)
    expect(json.error.message).toBe('You are not assigned to this section')
  })
})
