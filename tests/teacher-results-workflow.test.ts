import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockDispatchBulkNotification, mockGetStudentUserIdsForSection } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    teacher: { findUnique: vi.fn() },
    studentEnrollment: { findFirst: vi.fn() },
    subjectOffering: { findFirst: vi.fn(), findMany: vi.fn() },
    subjectResult: { count: vi.fn(), findMany: vi.fn() },
    termResult: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  }
  const mockDispatchBulkNotification = vi.fn()
  const mockGetStudentUserIdsForSection = vi.fn()

  return { mockAuth, mockPrisma, mockDispatchBulkNotification, mockGetStudentUserIdsForSection }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchBulkNotification: mockDispatchBulkNotification,
  getStudentUserIdsForSection: mockGetStudentUserIdsForSection,
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
    mockPrisma.$transaction.mockImplementation(async (callback: (transaction: unknown) => unknown) => callback({
      termResult: {
        update: vi.fn().mockResolvedValue({ id: 'result-1', classSectionId: 'section-1', examSessionId: 'exam-1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    }))
    mockGetStudentUserIdsForSection.mockResolvedValue(['student-user-1'])
    mockDispatchBulkNotification.mockRejectedValue(new Error('Notification provider unavailable'))

    const response = await declareTeacherResult(
      new Request('http://localhost/api/teacher-portal/results/result-1/declare') as never,
      { params: Promise.resolve({ id: 'result-1' }) }
    )

    expect(response.status).toBe(200)
    expect((await response.json()).success).toBe(true)
    expect(mockDispatchBulkNotification).toHaveBeenCalledOnce()
  })
})
