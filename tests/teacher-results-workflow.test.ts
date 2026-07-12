import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockDispatchBulkNotification } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    teacher: { findUnique: vi.fn() },
    studentEnrollment: { findFirst: vi.fn() },
    student: { findUnique: vi.fn() },
    subjectOffering: { findFirst: vi.fn(), findMany: vi.fn() },
    subjectResult: { count: vi.fn(), findMany: vi.fn() },
    termResult: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  }
  const mockDispatchBulkNotification = vi.fn()

  return { mockAuth, mockPrisma, mockDispatchBulkNotification }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchBulkNotification: mockDispatchBulkNotification,
}))

import { POST as saveTeacherResult } from '../app/api/teacher-portal/results/route'
import { POST as declareTeacherResult } from '../app/api/teacher-portal/results/[id]/declare/route'

describe('teacher result workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-teacher-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockPrisma.subjectOffering.findMany.mockResolvedValue([{ id: 'offering-1', classSectionId: 'section-1' }])
  })

  it('rejects saving marks for subject offerings not assigned to the teacher', async () => {
    mockPrisma.studentEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' })
    mockPrisma.subjectOffering.findMany.mockResolvedValue([{ id: 'offering-allowed', classSectionId: 'section-1' }])

    const request = new Request('http://localhost/api/teacher-portal/results', {
      method: 'POST',
      body: JSON.stringify({
        studentId: 'student-1',
        classSectionId: 'section-1',
        examSessionId: 'exam-1',
        subjectResults: [
          {
            subjectOfferingId: 'offering-allowed',
            totalMarks: 100,
            obtainedMarks: 88,
            isAbsent: false,
            isNotApplicable: false,
          },
          {
            subjectOfferingId: 'offering-unassigned',
            totalMarks: 100,
            obtainedMarks: 92,
            isAbsent: false,
            isNotApplicable: false,
          },
        ],
      }),
    })

    const response = await saveTeacherResult(request as never)
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error.message).toBe('One or more selected subjects are not assigned to you for this section.')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('blocks declaration and names pending subjects clearly', async () => {
    mockPrisma.termResult.findUnique.mockResolvedValue({
      id: 'result-1',
      classSectionId: 'section-1',
      examSessionId: 'exam-1',
      declarationStatus: 'DRAFT',
      classSection: { className: 'Class 10', sectionName: 'Jun' },
      student: { firstName: 'Rizwan', lastName: 'Ali' },
    })
    mockPrisma.subjectOffering.findFirst.mockResolvedValue({ id: 'offering-1' })
    mockPrisma.subjectResult.count.mockResolvedValue(2)
    mockPrisma.subjectResult.findMany.mockResolvedValue([
      {
        id: 'subject-result-1',
        subjectOffering: { subject: { name: 'Physics', code: 'PHY' } },
      },
      {
        id: 'subject-result-2',
        subjectOffering: { subject: { name: 'Chemistry', code: 'CHEM' } },
      },
    ])

    const response = await declareTeacherResult(
      new Request('http://localhost/api/teacher-portal/results/result-1/declare') as never,
      { params: Promise.resolve({ id: 'result-1' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.message).toContain('Complete pending marks before declaring: Physics, Chemistry')
    expect(json.error.message).toContain('The draft remains saved and hidden from students.')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockDispatchBulkNotification).not.toHaveBeenCalled()
  })

  it('keeps a successful declaration published when notification delivery fails', async () => {
    mockPrisma.termResult.findUnique.mockResolvedValue({
      id: 'result-1',
      classSectionId: 'section-1',
      examSessionId: 'exam-1',
      declarationStatus: 'DRAFT',
      classSection: { className: 'Class 10', sectionName: 'Jun' },
      student: { firstName: 'Rizwan', lastName: 'Ali' },
    })
    mockPrisma.subjectOffering.findFirst.mockResolvedValue({ id: 'offering-1' })
    mockPrisma.subjectResult.count.mockResolvedValue(1)
    mockPrisma.subjectResult.findMany.mockResolvedValue([])
    mockPrisma.termResult.update.mockResolvedValue({
      id: 'result-1',
      studentId: 'student-1',
      classSectionId: 'section-1',
      examSessionId: 'exam-1',
      declarationStatus: 'DECLARED',
    })
    mockPrisma.termResult.findMany.mockResolvedValue([])
    mockPrisma.student.findUnique.mockResolvedValue({ userId: 'student-user-1' })
    mockDispatchBulkNotification.mockRejectedValue(new Error('Notification provider unavailable'))

    const response = await declareTeacherResult(
      new Request('http://localhost/api/teacher-portal/results/result-1/declare') as never,
      { params: Promise.resolve({ id: 'result-1' }) }
    )

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      id: 'result-1',
      studentId: 'student-1',
      classSectionId: 'section-1',
      examSessionId: 'exam-1',
      declarationStatus: 'DECLARED',
    })
    expect(mockDispatchBulkNotification).toHaveBeenCalledOnce()
  })

  it('keeps a valid result declared when class-position recalculation fails', async () => {
    mockPrisma.termResult.findUnique.mockResolvedValue({
      id: 'result-1',
      classSectionId: 'section-1',
      examSessionId: 'exam-1',
      declarationStatus: 'DRAFT',
      classSection: { className: 'Class 10', sectionName: 'Jun' },
      student: { firstName: 'Rizwan', lastName: 'Ali' },
    })
    mockPrisma.subjectOffering.findFirst.mockResolvedValue({ id: 'offering-1' })
    mockPrisma.subjectResult.count.mockResolvedValue(1)
    mockPrisma.subjectResult.findMany.mockResolvedValue([])
    mockPrisma.termResult.update
      .mockResolvedValueOnce({
        id: 'result-1',
        studentId: 'student-1',
        classSectionId: 'section-1',
        examSessionId: 'exam-1',
        declarationStatus: 'DECLARED',
      })
      .mockRejectedValueOnce(new Error('classPosition column unavailable'))
    mockPrisma.termResult.findMany.mockResolvedValue([{ id: 'result-1', overallPercentage: 55 }])
    mockPrisma.student.findUnique.mockResolvedValue({ userId: 'student-user-1' })
    mockDispatchBulkNotification.mockResolvedValue(undefined)

    const response = await declareTeacherResult(
      new Request('http://localhost/api/teacher-portal/results/result-1/declare') as never,
      { params: Promise.resolve({ id: 'result-1' }) }
    )

    expect(response.status).toBe(200)
    expect((await response.json()).success).toBe(true)
    expect(mockDispatchBulkNotification).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['student-user-1'] }))
  })

  it('falls back gracefully when an older production schema lacks optional declaration audit columns', async () => {
    mockPrisma.termResult.findUnique.mockResolvedValue({
      id: 'result-1',
      classSectionId: 'section-1',
      examSessionId: 'exam-1',
      declarationStatus: 'DRAFT',
      classSection: { className: 'Class 10', sectionName: 'Jun' },
      student: { firstName: 'Rizwan', lastName: 'Ali' },
    })
    mockPrisma.subjectOffering.findFirst.mockResolvedValue({ id: 'offering-1' })
    mockPrisma.subjectResult.count.mockResolvedValue(1)
    mockPrisma.subjectResult.findMany.mockResolvedValue([])
    mockPrisma.termResult.update
      .mockRejectedValueOnce({ code: 'P2022', meta: { column: 'declaredById' } })
      .mockResolvedValueOnce({
        id: 'result-1',
        studentId: 'student-1',
        classSectionId: 'section-1',
        examSessionId: 'exam-1',
        declarationStatus: 'DECLARED',
      })
    mockPrisma.termResult.findMany.mockResolvedValue([])
    mockPrisma.student.findUnique.mockResolvedValue(null)

    const response = await declareTeacherResult(
      new Request('http://localhost/api/teacher-portal/results/result-1/declare') as never,
      { params: Promise.resolve({ id: 'result-1' }) }
    )

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.declarationStatus).toBe('DECLARED')
    expect(mockPrisma.termResult.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.not.objectContaining({ declaredById: expect.anything() }),
    }))
  })
})
