import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    teacher: { findUnique: vi.fn() },
    classTask: { findFirst: vi.fn() },
    studentEnrollment: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
    taskResult: { upsert: vi.fn() },
    class: { findUnique: vi.fn() },
    classSection: { findUnique: vi.fn(), findFirst: vi.fn() },
    shift: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  }
  return { mockAuth, mockPrisma }
})

const { getActiveAcademicYearMock, getOrSyncSectionEnrollmentsMock } = vi.hoisted(() => ({
  getActiveAcademicYearMock: vi.fn(),
  getOrSyncSectionEnrollmentsMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: getActiveAcademicYearMock }))
vi.mock('@/lib/academic/roster-helper', () => ({ getOrSyncSectionEnrollments: getOrSyncSectionEnrollmentsMock }))

import { GET, POST } from '../app/api/teacher-portal/tasks/[id]/marks/route'

const scopedTask = {
  id: 'task-1',
  classId: 'legacy-class-1',
  classSectionId: 'section-1',
  maxMarks: 50,
  class: { id: 'legacy-class-1', name: 'Class 10', section: 'Jun' },
  classSection: { id: 'section-1', className: 'Class 10', sectionName: 'Jun' },
  results: [
    {
      id: 'result-1',
      taskId: 'task-1',
      studentId: 'student-1',
      obtainedMarks: 42,
      remarks: 'Good work',
      student: { id: 'student-1', firstName: 'Rizwan', lastName: 'Ali', registrationNumber: 'REG-1', rollNumber: '2100' },
    },
  ],
}

const roster = [
  {
    studentId: 'student-1',
    rollNumber: '2100',
    student: { id: 'student-1', firstName: 'Rizwan', lastName: 'Ali', registrationNumber: 'REG-1', rollNumber: null },
  },
  {
    studentId: 'student-2',
    rollNumber: '2101',
    student: { id: 'student-2', firstName: 'Sara', lastName: 'Khan', registrationNumber: 'REG-2', rollNumber: null },
  },
]

describe('/api/teacher-portal/tasks/[id]/marks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockPrisma.classTask.findFirst.mockResolvedValue(scopedTask)
    mockPrisma.studentEnrollment.findMany.mockResolvedValue(roster)
    mockPrisma.student.findMany.mockResolvedValue([])
    mockPrisma.taskResult.upsert.mockImplementation((args) => Promise.resolve(args))
    mockPrisma.$transaction.mockImplementation((ops) => Promise.all(ops))
    mockPrisma.class.findUnique.mockResolvedValue(null)
    mockPrisma.classSection.findFirst.mockResolvedValue(null)
    mockPrisma.shift.findFirst.mockResolvedValue(null)
    getActiveAcademicYearMock.mockResolvedValue({ id: 'year-1' })
    getOrSyncSectionEnrollmentsMock.mockResolvedValue({ enrollments: roster })
  })

  it('lists the active enrolled students for a section-scoped task', async () => {
    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/tasks/task-1/marks'), {
      params: Promise.resolve({ id: 'task-1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mockPrisma.studentEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classSectionId: 'section-1', status: 'ACTIVE' },
    }))
    expect(json.data).toHaveLength(2)
    expect(json.data[0]).toEqual(expect.objectContaining({
      studentId: 'student-1',
      obtainedMarks: 42,
      remarks: 'Good work',
      student: expect.objectContaining({ rollNumber: '2100' }),
    }))
    expect(json.data[1]).toEqual(expect.objectContaining({
      studentId: 'student-2',
      obtainedMarks: 0,
      remarks: null,
    }))
  })

  it('rejects marks for students outside the task section roster', async () => {
    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/tasks/task-1/marks', {
      method: 'POST',
      body: JSON.stringify({ records: [{ studentId: 'student-outside', obtainedMarks: 20 }] }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: 'task-1' }) })
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error.message).toBe('One or more students are not enrolled in this task section.')
    expect(mockPrisma.taskResult.upsert).not.toHaveBeenCalled()
  })

  it('falls back to the shared roster resolver when enrollment rows are missing', async () => {
    mockPrisma.studentEnrollment.findMany.mockResolvedValueOnce([])

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/tasks/task-1/marks'), {
      params: Promise.resolve({ id: 'task-1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(getOrSyncSectionEnrollmentsMock).toHaveBeenCalledWith('section-1', 'year-1')
    expect(json.data).toHaveLength(2)
  })

  it('saves marks only for enrolled students and enforces task max marks', async () => {
    const tooHigh = await POST(new NextRequest('http://localhost/api/teacher-portal/tasks/task-1/marks', {
      method: 'POST',
      body: JSON.stringify({ records: [{ studentId: 'student-1', obtainedMarks: 55 }] }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(tooHigh.status).toBe(400)
    expect(mockPrisma.taskResult.upsert).not.toHaveBeenCalled()

    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/tasks/task-1/marks', {
      method: 'POST',
      body: JSON.stringify({ records: [{ studentId: 'student-1', obtainedMarks: 45, remarks: 'Excellent' }] }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(response.status).toBe(200)
    expect(mockPrisma.taskResult.upsert).toHaveBeenCalledWith({
      where: { taskId_studentId: { taskId: 'task-1', studentId: 'student-1' } },
      update: { obtainedMarks: 45, remarks: 'Excellent' },
      create: { taskId: 'task-1', studentId: 'student-1', obtainedMarks: 45, remarks: 'Excellent' },
    })
  })
})
