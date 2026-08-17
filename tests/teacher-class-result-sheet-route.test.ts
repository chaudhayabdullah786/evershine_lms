import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockTeacherAccess, mockRosterSync, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockTx = {
    termResult: { upsert: vi.fn(), update: vi.fn() },
    subjectResult: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  }
  return {
    mockAuth: vi.fn(),
    mockTeacherAccess: vi.fn(),
    mockRosterSync: vi.fn(),
    mockPrisma: {
      teacher: { findUnique: vi.fn() },
      academicYear: { findUnique: vi.fn() },
      classSection: { findUnique: vi.fn() },
      studentEnrollment: { findMany: vi.fn() },
      subjectOffering: { findMany: vi.fn() },
      termResult: { findMany: vi.fn() },
      classTeacher: { findFirst: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
    },
    mockTx,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/teacher-scope', () => ({ teacherCanAccessClassSection: mockTeacherAccess }))
vi.mock('@/lib/academic/roster-helper', () => ({ getOrSyncSectionEnrollments: mockRosterSync }))
vi.mock('@/lib/teacher-access', () => ({ resolveClassContext: vi.fn().mockResolvedValue({ legacyClassId: 'legacy-class-1' }) }))

import { GET, POST } from '@/app/api/teacher-portal/results/class-sheet/route'

describe('teacher class result sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockPrisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1', name: '2026-2027', isActive: true })
    mockTeacherAccess.mockResolvedValue(true)
    mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'class-teacher-1' })
    mockPrisma.classSection.findUnique.mockResolvedValue({
      id: 'section-1', className: 'Class 11', sectionName: 'A', shift: { name: 'Morning', code: 'MORNING' },
    })
    mockPrisma.studentEnrollment.findMany.mockResolvedValue([{
      studentId: 'student-1',
      rollNumber: '001',
      student: { id: 'student-1', firstName: 'Test', lastName: 'Student', fatherName: 'Parent', registrationNumber: 'REG-1' },
    }])
    mockPrisma.subjectOffering.findMany
      .mockResolvedValueOnce([{ id: 'offering-1' }])
      .mockResolvedValue([{ id: 'offering-1', subject: { id: 'subject-1', name: 'Biology', code: 'BIO' } }])
    mockPrisma.termResult.findMany.mockResolvedValue([])
    mockTx.termResult.upsert.mockResolvedValue({ id: 'term-result-1' })
    mockTx.termResult.update.mockResolvedValue({ id: 'term-result-1' })
    mockTx.subjectResult.deleteMany.mockResolvedValue({ count: 0 })
    mockTx.subjectResult.createMany.mockResolvedValue({ count: 1 })
    mockTx.subjectResult.findMany.mockResolvedValue([{ totalMarks: 100, obtainedMarks: null, isAbsent: false, isNotApplicable: false }])
  })

  it('returns active students, offered subjects, and empty draft rows', async () => {
    const response = await GET(new Request('http://localhost/api/teacher-portal/results/class-sheet?classSectionId=section-1&resultSessionId=year-1') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.resultSession).toMatchObject({ id: 'year-1', type: 'ANNUAL' })
    expect(json.data.subjects).toEqual([{ id: 'offering-1', name: 'Biology', code: 'BIO', totalMarks: 100 }])
    expect(json.data.students[0]).toMatchObject({ id: 'student-1', rollNumber: '001', result: null })
    expect(json.data.canDeclare).toBe(true)
    expect(mockPrisma.classTeacher.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isClassTeacher: true, academicYear: '2026-2027' }),
    }))
  })

  it('saves a class draft atomically and preserves pending marks as null', async () => {
    const response = await POST(new Request('http://localhost/api/teacher-portal/results/class-sheet', {
      method: 'POST',
      body: JSON.stringify({
        classSectionId: 'section-1',
        resultSessionId: 'year-1',
        rows: [{
          studentId: 'student-1',
          subjectResults: [{
            subjectOfferingId: 'offering-1', totalMarks: 100, obtainedMarks: null,
            isAbsent: false, isNotApplicable: false,
          }],
        }],
      }),
    }) as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual({ savedCount: 1 })
    expect(mockTx.termResult.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ examSessionId: 'year-1', declarationStatus: 'DRAFT' }),
    }))
    expect(mockTx.subjectResult.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ obtainedMarks: null, resultStatus: 'Pending' })],
    })
    expect(mockTx.termResult.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ customFields: undefined, teacherRemarks: undefined }),
    }))
  })

  it('does not expose subjects or declaration to a subject teacher assigned elsewhere', async () => {
    mockPrisma.classTeacher.findFirst.mockResolvedValue(null)
    mockPrisma.subjectOffering.findMany.mockReset()
    mockPrisma.subjectOffering.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'offering-other', teacherId: 'teacher-2', subject: { id: 'subject-2', name: 'Physics', code: 'PHY' } }])
    mockPrisma.termResult.findMany.mockResolvedValue([])

    const response = await GET(new Request('http://localhost/api/teacher-portal/results/class-sheet?classSectionId=section-1&resultSessionId=year-1') as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.subjects).toEqual([])
    expect(json.data.canDeclare).toBe(false)
  })
})
