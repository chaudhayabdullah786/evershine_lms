import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockTx = {
    class: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    classSection: { findMany: vi.fn() },
    exam: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const mockPrisma = {
    $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
  }
  return { mockAuth, mockCheckPermission, mockPrisma, mockTx }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST } from '../app/api/exams/route'

describe('POST /api/exams Academic Engine bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'super-user-1', role: 'SUPER_ADMIN', campusId: null } })
    mockCheckPermission.mockReturnValue(true)
    mockTx.class.findMany.mockResolvedValue([])
    mockTx.classSection.findMany.mockResolvedValue([
      {
        id: 'section-1',
        className: 'Class 9',
        sectionName: 'A',
        grade: 9,
        campusId: 'campus-1',
        batchId: 'batch-1',
        capacity: 35,
        shift: { name: 'Morning', code: 'MORNING' },
      },
    ])
    mockTx.class.findUnique.mockResolvedValue(null)
    mockTx.class.create.mockResolvedValue({ id: 'legacy-class-1' })
    mockTx.exam.create.mockResolvedValue({ id: 'exam-1', classId: 'legacy-class-1' })
    mockTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  it('creates or reuses a legacy Class before scheduling an exam for a class section', async () => {
    const response = await POST(new NextRequest('http://localhost/api/exams', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mid Term',
        classIds: [],
        classSectionIds: ['section-1'],
        academicYear: '2026-2027',
        startDate: '2026-07-10T00:00:00.000Z',
        endDate: '2026-07-12T23:59:59.000Z',
        totalMarks: 100,
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(mockTx.class.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Class 9 - A - Morning',
        grade: 9,
        section: 'A',
        shift: 'MORNING',
        campusId: 'campus-1',
        batchId: 'batch-1',
        academicYear: '2026-2027',
      }),
    }))
    expect(mockTx.exam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ classId: 'legacy-class-1', name: 'Mid Term' }),
    })
  })
})
