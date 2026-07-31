import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockGuardianAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGuardianAccess: vi.fn(),
  mockPrisma: {
    student: { findUnique: vi.fn() },
    studentEnrollment: { findMany: vi.fn() },
    termResult: { findMany: vi.fn() },
    taskResult: { findMany: vi.fn() },
    enrollmentAttendanceRecord: { findMany: vi.fn() },
    feeInvoice: { findMany: vi.fn() },
    timetableSlot: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/guardian', () => ({
  assertGuardianAccessToStudent: mockGuardianAccess,
}))
vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: vi.fn().mockResolvedValue(null),
  calculateWeightedPercentage: vi.fn(),
}))

import { GET as getStudentResults } from '@/app/api/student-portal/results/route'
import { GET as getGuardianAcademic } from '@/app/api/guardian-portal/children/[studentId]/academic/route'

const declaredResult = {
  id: 'result-1',
  studentId: 'student-1',
  examSessionId: 'exam-1',
  declarationStatus: 'DECLARED',
  overallPercentage: 75,
  grade: 'B+',
  classPosition: 2,
  performanceBatch: 'Quaid',
  teacherRemarks: 'Strong progress',
  customFields: [{ label: 'Ethics', value: '15' }],
  declaredAt: new Date('2026-07-30T10:00:00.000Z'),
  createdAt: new Date('2026-07-30T09:00:00.000Z'),
  classSection: {
    className: 'Class 11',
    sectionName: 'A',
    shift: { code: 'MORNING', name: 'Morning' },
  },
  subjectResults: [{
    id: 'subject-result-1',
    totalMarks: 100,
    obtainedMarks: 75,
    percentage: 75,
    grade: 'B+',
    resultStatus: 'Pass',
    isAbsent: false,
    isNotApplicable: false,
    remarks: 'Good',
    performanceBatch: 'Quaid',
    subjectOffering: {
      subject: { id: 'subject-1', name: 'Biology', code: 'BIO' },
    },
  }],
}

describe('declared result portal visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.studentEnrollment.findMany.mockResolvedValue([])
    mockPrisma.taskResult.findMany.mockResolvedValue([])
    mockPrisma.enrollmentAttendanceRecord.findMany.mockResolvedValue([])
    mockPrisma.feeInvoice.findMany.mockResolvedValue([])
    mockPrisma.termResult.findMany.mockResolvedValue([declaredResult])
  })

  it('includes custom result fields in the authenticated student response', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'student-user-1', role: 'STUDENT' } })
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'student-1' })

    const response = await getStudentResults()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.declaredResults[0]).toMatchObject({
      termResultId: 'result-1',
      customFields: [{ label: 'Ethics', value: '15' }],
    })
  })

  it('returns declared term results and custom fields to an authorized guardian', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'parent-user-1', role: 'PARENT' } })
    mockGuardianAccess.mockResolvedValue(true)
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 'student-1',
      firstName: 'Test',
      lastName: 'Student',
      campus: { name: 'Main' },
      batch: null,
      class: null,
    })

    const response = await getGuardianAcademic(
      new Request('http://localhost/api/guardian-portal/children/student-1/academic'),
      { params: Promise.resolve({ studentId: 'student-1' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.declaredResults[0]).toMatchObject({
      id: 'result-1',
      examSessionId: 'exam-1',
      customFields: [{ label: 'Ethics', value: '15' }],
      subjects: [{
        subjectName: 'Biology',
        obtainedMarks: 75,
        resultStatus: 'Pass',
      }],
    })
  })
})
