import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuth,
  mockPrisma,
  mockEnsureFeedbackQuestions,
  mockGetOpenFeedbackCycleForStudents,
  mockGetPendingTeachersForStudent,
} = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    student: { findUnique: vi.fn() },
    monthlyFeedbackCycle: { findUnique: vi.fn() },
    studentEnrollment: { findFirst: vi.fn() },
    feedbackQuestion: { findMany: vi.fn() },
    feedbackAnswer: { findFirst: vi.fn() },
    studentFeedbackSubmission: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  }

  return {
    mockAuth,
    mockPrisma,
    mockEnsureFeedbackQuestions: vi.fn(),
    mockGetOpenFeedbackCycleForStudents: vi.fn(),
    mockGetPendingTeachersForStudent: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/feedback/engine', () => ({
  ensureFeedbackQuestions: mockEnsureFeedbackQuestions,
  getOpenFeedbackCycleForStudents: mockGetOpenFeedbackCycleForStudents,
  getPendingTeachersForStudent: mockGetPendingTeachersForStudent,
}))

import { GET } from '../app/api/feedback/student/pending/route'
import { POST } from '../app/api/feedback/student/submit/route'

describe('student teacher feedback routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'student-user-1', role: 'STUDENT' } })
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'clxstudent000000000001' })
    mockEnsureFeedbackQuestions.mockResolvedValue(2)
    mockGetOpenFeedbackCycleForStudents.mockResolvedValue({
      id: 'clxcycle00000000000001',
      label: 'June 2026',
      year: 2026,
      month: 6,
    })
    mockGetPendingTeachersForStudent.mockResolvedValue([
      {
        teacherId: 'clxteacher000000000001',
        studentEnrollmentId: 'clxenroll0000000000001',
        teacherName: 'Ayesha Khan',
        classSectionLabel: '10-A',
        campusName: 'Main',
        batchName: '2026',
        shiftName: 'Morning',
        subjects: ['Mathematics'],
      },
    ])
  })

  it('returns only active teacher questions for the student teacher feedback form', async () => {
    mockPrisma.feedbackQuestion.findMany.mockResolvedValue([
      { id: 'clxteacherq00000000001', category: 'TEACHER', text: 'Explains clearly' },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mockPrisma.feedbackQuestion.findMany).toHaveBeenCalledWith({
      where: { isActive: true, category: 'TEACHER' },
      orderBy: { orderIndex: 'asc' },
    })
  })

  it('rejects submissions that include service questions as teacher feedback', async () => {
    mockPrisma.monthlyFeedbackCycle.findUnique.mockResolvedValue({
      id: 'clxcycle00000000000001',
      isOpen: true,
    })
    mockPrisma.studentEnrollment.findFirst.mockResolvedValue({
      id: 'clxenroll0000000000001',
      classSection: { campusId: 'clxcampus000000000001', batchId: 'clxbatch000000000001' },
    })
    mockPrisma.feedbackQuestion.findMany.mockResolvedValue([
      { id: 'clxteacherq00000000001' },
    ])

    const response = await POST(new NextRequest('http://localhost/api/feedback/student/submit', {
      method: 'POST',
      body: JSON.stringify({
        cycleId: 'clxcycle00000000000001',
        teacherId: 'clxteacher000000000001',
        studentEnrollmentId: 'clxenroll0000000000001',
        answers: [
          { questionId: 'clxserviceq00000000001', response: 'AGREE' },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(mockPrisma.feedbackAnswer.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
