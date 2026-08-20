import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuth,
  mockPermission,
  mockPrisma,
  mockClassFindFirst,
} = vi.hoisted(() => {
  const mockClassFindFirst = vi.fn()
  return {
    mockAuth: vi.fn(),
    mockPermission: vi.fn(),
    mockClassFindFirst,
    mockPrisma: {
      teacher: { findUnique: vi.fn() },
      classSection: { findUnique: vi.fn() },
      academicYear: { findFirst: vi.fn() },
      class: { findFirst: mockClassFindFirst, upsert: vi.fn() },
      classTeacher: { upsert: vi.fn() },
      subjectOffering: { findFirst: vi.fn(), findUnique: vi.fn() },
      academicSubject: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST } from '@/app/api/teachers/[id]/classes/route'

describe('Academic Engine class assignment bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-user', role: 'SUPER_ADMIN' } })
    mockPermission.mockReturnValue(true)
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1', campusId: 'campus-1', isActive: true })
    mockPrisma.classSection.findUnique.mockResolvedValue({
      id: 'c123456789012345678901234',
      campusId: 'campus-1',
      batchId: 'batch-1',
      className: 'Class 11',
      sectionName: 'A',
      grade: 11,
      shift: { code: 'MORNING', name: 'Morning' },
    })
    mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1' })
    mockClassFindFirst.mockResolvedValue(null)
    mockPrisma.class.upsert.mockResolvedValue({
      id: 'legacy-class-1', name: 'Class 11 - MORNING (A)', section: 'A',
      batchId: 'batch-1', shift: 'MORNING', campusId: 'campus-1', grade: 11, academicYear: '2026-2027',
    })
    mockPrisma.classTeacher.upsert.mockResolvedValue({
      id: 'class-teacher-1', classId: 'legacy-class-1', teacherId: 'teacher-1',
      academicYear: '2026-2027', isClassTeacher: true,
    })
    mockPrisma.subjectOffering.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockPrisma.academicSubject.findFirst.mockResolvedValue({ id: 'subject-1' })
    mockPrisma.subjectOffering.findUnique.mockResolvedValue(null)
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      teacherSectionAssignment: { upsert: vi.fn().mockResolvedValue({ id: 'assignment-1' }) },
      subjectOffering: { create: vi.fn().mockResolvedValue({ id: 'offering-1' }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }))
  })

  it('persists isClassTeacher for an Academic Engine section', async () => {
    const response = await POST(new NextRequest('http://localhost/api/teachers/teacher-1/classes', {
      method: 'POST',
      body: JSON.stringify({
        classSectionId: 'c123456789012345678901234',
        isClassTeacher: true,
        academicYear: '2026-2027',
      }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: 'teacher-1' }) })

    expect(response.status).toBe(201)
    expect(mockPrisma.classTeacher.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { classId_teacherId_academicYear: {
        classId: 'legacy-class-1', teacherId: 'teacher-1', academicYear: '2026-2027',
      } },
      create: expect.objectContaining({ isClassTeacher: true }),
    }))
  })
})
