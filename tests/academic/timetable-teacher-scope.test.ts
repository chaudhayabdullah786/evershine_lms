import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { authMock, requireSessionMock, permissionMock, teacherFindUniqueMock, activeYearMock, slotFindManyMock, assignmentFindManyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  requireSessionMock: vi.fn(),
  permissionMock: vi.fn(),
  teacherFindUniqueMock: vi.fn(),
  activeYearMock: vi.fn(),
  slotFindManyMock: vi.fn(),
  assignmentFindManyMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/rbac', () => ({ checkPermission: permissionMock }))
vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: requireSessionMock,
  requirePermission: vi.fn(() => null),
}))
vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: activeYearMock,
  assertAcademicYearEditable: vi.fn(),
  validateTimetableSlot: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: teacherFindUniqueMock },
    teacherSectionAssignment: { findMany: assignmentFindManyMock },
    academicYear: { findUnique: vi.fn(), findFirst: vi.fn() },
    timetableSlot: { findMany: slotFindManyMock },
  },
}))

import { GET as getAdminSlots } from '@/app/api/timetable/slots/route'
import { GET as getTeacherTimetable } from '@/app/api/teachers/[id]/timetable/route'

describe('teacher timetable visibility contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockReturnValue(true)
    requireSessionMock.mockResolvedValue({
      session: { user: { id: 'admin-user', role: 'SUPER_ADMIN' } },
      error: null,
    })
    authMock.mockResolvedValue({ user: { id: 'teacher-user', role: 'TEACHER', campusId: 'campus-1' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1', userId: 'teacher-user', campusId: 'campus-1' })
    activeYearMock.mockResolvedValue({ id: 'year-active', name: '2025-2026' })
    slotFindManyMock.mockResolvedValue([])
    assignmentFindManyMock.mockResolvedValue([{ classSectionId: 'section-1' }])
  })

  it('loads a selected teacher\'s published slots across sections for conflict review', async () => {
    const response = await getAdminSlots(new Request(
      'http://localhost/api/timetable/slots?academicYearId=year-active&teacherId=teacher-1&published=true'
    ) as unknown as NextRequest)

    expect(response.status).toBe(200)
    expect(slotFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        academicYearId: 'year-active',
        teacherId: 'teacher-1',
        isPublished: true,
      },
    }))
  })

  it('reads only published Academic Engine slots for the active year', async () => {
    slotFindManyMock.mockResolvedValue([
      {
        id: 'slot-1',
        academicYearId: 'year-active',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '09:45',
        classSection: { id: 'section-1', className: 'Class 10', sectionName: 'A', shift: { id: 'shift-1', name: 'Morning', code: 'MORNING' } },
        subjectOffering: { id: 'offering-1', subject: { id: 'subject-1', name: 'Physics' } },
        teacher: { id: 'teacher-1', firstName: 'Moaaz', lastName: 'Hafeez' },
      },
    ])

    const response = await getTeacherTimetable(
      new Request('http://localhost/api/teachers/teacher-1/timetable') as unknown as NextRequest,
      { params: Promise.resolve({ id: 'teacher-1' }) },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([expect.objectContaining({
      id: 'slot-1',
      academicYearId: 'year-active',
      dayOfWeek: 0,
      source: 'engine',
    })])
    expect(slotFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        teacherId: 'teacher-1',
        academicYearId: 'year-active',
        isPublished: true,
      }),
    }))
  })
})
