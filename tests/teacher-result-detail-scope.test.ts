import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockAccess, mockActiveYear, mockResolveContext, mockPrisma } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockAccess: vi.fn(),
  mockActiveYear: vi.fn(),
  mockResolveContext: vi.fn(),
  mockPrisma: {
    teacher: { findUnique: vi.fn() },
    termResult: { findUnique: vi.fn() },
    subjectOffering: { findMany: vi.fn() },
    classTeacher: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/teacher-scope', () => ({ teacherCanAccessClassSection: mockAccess }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: mockActiveYear }))
vi.mock('@/lib/teacher-access', () => ({ resolveClassContext: mockResolveContext }))

import { GET, PATCH } from '@/app/api/teacher-portal/results/[id]/route'

const subjectResults = [
  {
    id: 'subject-result-1',
    subjectOfferingId: 'offering-1',
    totalMarks: 100,
    obtainedMarks: 80,
    isAbsent: false,
    isNotApplicable: false,
    percentage: 80,
    grade: 'A',
    resultStatus: 'Pass',
    remarks: null,
    subjectOffering: { subject: { name: 'Biology', code: 'BIO' } },
  },
  {
    id: 'subject-result-2',
    subjectOfferingId: 'offering-2',
    totalMarks: 100,
    obtainedMarks: 70,
    isAbsent: false,
    isNotApplicable: false,
    percentage: 70,
    grade: 'B',
    resultStatus: 'Pass',
    remarks: null,
    subjectOffering: { subject: { name: 'Physics', code: 'PHY' } },
  },
]

describe('teacher result detail subject scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockAccess.mockResolvedValue(true)
    mockActiveYear.mockResolvedValue({ id: 'year-1', name: '2026-2027' })
    mockResolveContext.mockResolvedValue({ legacyClassId: 'legacy-class-1' })
    mockPrisma.classTeacher.findFirst.mockResolvedValue(null)
    mockPrisma.subjectOffering.findMany.mockResolvedValue([
      { id: 'offering-1', teacherId: 'teacher-1' },
      { id: 'offering-2', teacherId: 'teacher-2' },
    ])
  })

  it('only returns the subject teacher assigned offering', async () => {
    mockPrisma.termResult.findUnique.mockResolvedValue({
      id: 'result-1',
      studentId: 'student-1',
      classSectionId: 'section-1',
      examSessionId: 'year-1',
      declarationStatus: 'DRAFT',
      overallPercentage: 75,
      grade: 'B',
      performanceBatch: 'Quaid',
      classPosition: null,
      teacherRemarks: null,
      customFields: [],
      student: { id: 'student-1', firstName: 'Test', lastName: 'Student', rollNumber: '1' },
      subjectResults,
    })

    const response = await GET(new NextRequest('http://localhost/api/teacher-portal/results/result-1'), {
      params: Promise.resolve({ id: 'result-1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.subjectResults).toHaveLength(1)
    expect(json.data.subjectResults[0].subjectOfferingId).toBe('offering-1')
  })

  it('rejects edits to another teacher subject and keeps the transaction untouched', async () => {
    mockPrisma.termResult.findUnique.mockResolvedValue({
      id: 'result-1',
      classSectionId: 'section-1',
      declarationStatus: 'DRAFT',
      overallPercentage: 75,
      teacherRemarks: null,
      customFields: [],
      subjectResults: subjectResults.map((score) => ({
        id: score.id,
        subjectOfferingId: score.subjectOfferingId,
        totalMarks: score.totalMarks,
        obtainedMarks: score.obtainedMarks,
        isAbsent: score.isAbsent,
        isNotApplicable: score.isNotApplicable,
        percentage: score.percentage,
        grade: score.grade,
        resultStatus: score.resultStatus,
        remarks: score.remarks,
      })),
    })

    const response = await PATCH(new NextRequest('http://localhost/api/teacher-portal/results/result-1', {
      method: 'PATCH',
      body: JSON.stringify({
        subjectResults: [{ id: 'subject-result-2', obtainedMarks: 99 }],
        reason: 'Correction',
      }),
    }), { params: Promise.resolve({ id: 'result-1' }) })

    expect(response.status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
