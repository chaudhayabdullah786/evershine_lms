import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockRequireSession, mockRequirePermission, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockRequireSession = vi.fn()
  const mockRequirePermission = vi.fn()
  const mockTx = {
    feePolicy: { create: vi.fn(), update: vi.fn() },
    teacherPenaltyPolicy: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const mockPrisma = {
    feePolicy: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    teacherPenaltyPolicy: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>> | ((tx: typeof mockTx) => Promise<unknown>)) => {
      if (Array.isArray(ops)) return Promise.all(ops)
      return ops(mockTx)
    }),
  }

  return { mockRequireSession, mockRequirePermission, mockPrisma, mockTx }
})

vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: mockRequireSession,
  requirePermission: mockRequirePermission,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST as createFeePolicy } from '../app/api/fee-penalties/route'
import { PATCH as updateFeePolicy } from '../app/api/fee-penalties/[id]/route'
import { POST as createTeacherPolicy } from '../app/api/teacher-penalties/route'
import { PATCH as updateTeacherPolicy } from '../app/api/teacher-penalties/[id]/route'

const feePayload = {
  campusId: null,
  batchId: null,
  graceDays: 7,
  penaltyType: 'FIXED',
  penaltyValue: 500,
  maxPenalty: null,
  allowedLeavesPerMonth: 1,
  leavePenaltyAmount: 200,
}

const teacherPayload = {
  campusId: null,
  lateThreshold: 3,
  penaltyType: 'FIXED',
  penaltyValue: 200,
  repeatMultiplier: null,
  allowedLeavesPerMonth: 1,
  leavePenaltyAmount: 500,
}

describe('penalty policy routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({
      session: { user: { id: 'admin-1', role: 'SUPER_ADMIN' } },
      error: null,
    })
    mockRequirePermission.mockReturnValue(null)
  })

  it('rejects duplicate active fee policies for the same scope', async () => {
    mockPrisma.feePolicy.findFirst.mockResolvedValue({ id: 'clxfeeexisting000001' })

    const response = await createFeePolicy(new NextRequest('http://localhost/api/fee-penalties', {
      method: 'POST',
      body: JSON.stringify(feePayload),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(409)
    expect(mockTx.feePolicy.create).not.toHaveBeenCalled()
  })

  it('rejects reactivating a fee policy into a scope that already has an active policy', async () => {
    mockPrisma.feePolicy.findUnique.mockResolvedValue({
      id: 'clxfeepolicy000000001',
      campusId: null,
      batchId: null,
      isActive: false,
    })
    mockPrisma.feePolicy.findFirst.mockResolvedValue({ id: 'clxfeeexisting000001' })

    const response = await updateFeePolicy(
      new NextRequest('http://localhost/api/fee-penalties/clxfeepolicy000000001', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'clxfeepolicy000000001' }) }
    )

    expect(response.status).toBe(409)
    expect(mockTx.feePolicy.update).not.toHaveBeenCalled()
  })

  it('rejects duplicate active teacher penalty policies for the same campus', async () => {
    mockPrisma.teacherPenaltyPolicy.findFirst.mockResolvedValue({ id: 'clxteacherpolicy0001' })

    const response = await createTeacherPolicy(new NextRequest('http://localhost/api/teacher-penalties', {
      method: 'POST',
      body: JSON.stringify(teacherPayload),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(409)
    expect(mockTx.teacherPenaltyPolicy.create).not.toHaveBeenCalled()
  })

  it('rejects reactivating a teacher policy into a campus that already has an active policy', async () => {
    mockPrisma.teacherPenaltyPolicy.findUnique.mockResolvedValue({
      id: 'clxteacherpolicy0002',
      campusId: null,
      isActive: false,
    })
    mockPrisma.teacherPenaltyPolicy.findFirst.mockResolvedValue({ id: 'clxteacherpolicy0001' })

    const response = await updateTeacherPolicy(
      new NextRequest('http://localhost/api/teacher-penalties/clxteacherpolicy0002', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'clxteacherpolicy0002' }) }
    )

    expect(response.status).toBe(409)
    expect(mockTx.teacherPenaltyPolicy.update).not.toHaveBeenCalled()
  })
})
