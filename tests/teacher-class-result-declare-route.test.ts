import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockAccess, mockResolveContext, mockRosterSync, mockDispatch, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockTx = {
    termResult: { updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  }
  return {
    mockAuth: vi.fn(),
    mockAccess: vi.fn(),
    mockResolveContext: vi.fn(),
    mockRosterSync: vi.fn(),
    mockDispatch: vi.fn(),
    mockPrisma: {
      teacher: { findUnique: vi.fn() },
      academicYear: { findUnique: vi.fn() },
      classTeacher: { findFirst: vi.fn() },
      subjectOffering: { findMany: vi.fn() },
      studentEnrollment: { findMany: vi.fn() },
      termResult: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
    },
    mockTx,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/teacher-scope', () => ({ teacherCanAccessClassSection: mockAccess }))
vi.mock('@/lib/teacher-access', () => ({ resolveClassContext: mockResolveContext }))
vi.mock('@/lib/academic/roster-helper', () => ({ getOrSyncSectionEnrollments: mockRosterSync }))
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchBulkNotification: mockDispatch }))

import { POST } from '@/app/api/teacher-portal/results/class-sheet/declare/route'

describe('POST /api/teacher-portal/results/class-sheet/declare', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockPrisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1', name: '2026-2027', isActive: true })
    mockAccess.mockResolvedValue(true)
    mockResolveContext.mockResolvedValue({ legacyClassId: 'legacy-class-1' })
    mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'class-teacher-1' })
    mockPrisma.subjectOffering.findMany.mockResolvedValue([{ id: 'offering-1', subject: { name: 'Biology' } }])
    mockPrisma.studentEnrollment.findMany.mockResolvedValue([{ studentId: 'student-1', student: { userId: 'student-user-1' } }])
    mockPrisma.termResult.findMany.mockResolvedValue([{
      id: 'result-1', studentId: 'student-1', declarationStatus: 'DRAFT',
      subjectResults: [{ subjectOfferingId: 'offering-1', resultStatus: 'Pass', isAbsent: false, isNotApplicable: false }],
    }])
    mockTx.termResult.updateMany.mockResolvedValue({ count: 1 })
    mockTx.termResult.findMany.mockResolvedValue([{ id: 'result-1', overallPercentage: 85 }])
    mockTx.termResult.update.mockResolvedValue({ id: 'result-1' })
    mockDispatch.mockResolvedValue(undefined)
    mockRosterSync.mockResolvedValue({
      enrollments: [{ studentId: 'student-1', student: { id: 'student-1' }, rollNumber: '001' }],
    })
  })

  it('declares a complete class result and notifies enrolled students', async () => {
    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/results/class-sheet/declare', {
      method: 'POST',
      body: JSON.stringify({ classSectionId: 'section-1', resultSessionId: 'year-1' }),
      headers: { 'content-type': 'application/json' },
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual({ declaredCount: 1 })
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['student-user-1'] }))
  })

  it('refuses a class result when a subject is pending', async () => {
    mockPrisma.termResult.findMany.mockResolvedValue([{
      id: 'result-1', studentId: 'student-1', declarationStatus: 'DRAFT',
      subjectResults: [{ subjectOfferingId: 'offering-1', resultStatus: 'Pending', isAbsent: false, isNotApplicable: false }],
    }])

    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/results/class-sheet/declare', {
      method: 'POST',
      body: JSON.stringify({ classSectionId: 'section-1', resultSessionId: 'year-1' }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses legacy rows with no marks even when resultStatus is missing', async () => {
    mockPrisma.termResult.findMany.mockResolvedValue([{
      id: 'result-1', studentId: 'student-1', declarationStatus: 'DRAFT',
      subjectResults: [{ subjectOfferingId: 'offering-1', resultStatus: null, obtainedMarks: null, isAbsent: false, isNotApplicable: false }],
    }])

    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/results/class-sheet/declare', {
      method: 'POST',
      body: JSON.stringify({ classSectionId: 'section-1', resultSessionId: 'year-1' }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('uses the shared roster bridge before rejecting a migrated section', async () => {
    mockPrisma.studentEnrollment.findMany.mockResolvedValue([])

    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/results/class-sheet/declare', {
      method: 'POST',
      body: JSON.stringify({ classSectionId: 'section-1', resultSessionId: 'year-1' }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(200)
    expect(mockRosterSync).toHaveBeenCalledWith('section-1', 'year-1')
  })

  it('refuses declaration when the section has no offered subjects', async () => {
    mockPrisma.subjectOffering.findMany.mockResolvedValue([])

    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/results/class-sheet/declare', {
      method: 'POST',
      body: JSON.stringify({ classSectionId: 'section-1', resultSessionId: 'year-1' }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
