import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()

  const mockTx = {
    feeInvoice: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    student: { update: vi.fn() },
  }

  const mockPrisma = {
    student: { findUnique: vi.fn() },
    feeInvoice: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  }

  return { mockAuth, mockCheckPermission, mockPrisma, mockTx }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST } from '../app/api/fees/route'

const validPayload = {
  studentId: 'student-1',
  month: 'June 2026',
  academicYear: '2026-2027',
  dueDate: '2026-07-10',
  bankAccounts: 'Allied Bank: 123456789',
  items: [
    { description: 'Tuition Fee', amount: 5000 },
    { description: 'Examination Fee', amount: 1000 },
  ],
  discount: 500,
  lateFee: 100,
  notes: 'Monthly challan',
}

describe('POST /api/fees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockCheckPermission.mockReturnValue(true)
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 'student-1',
      isActive: true,
      firstName: 'Ali',
      lastName: 'Hassan',
      rollNumber: '22',
      registrationNumber: 'ESA-2026-001',
    })
    mockPrisma.feeInvoice.findFirst.mockResolvedValue(null)
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
    mockTx.feeInvoice.create.mockResolvedValue({
      id: 'invoice-1',
      challanNumber: 'CHL/22/2627/JUN',
      studentId: 'student-1',
      totalAmount: 5600,
      items: [],
    })
    mockTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mockTx.student.update.mockResolvedValue({ id: 'student-1' })
  })

  it('creates a SuperAdmin challan and updates student outstanding balance', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/fees', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(201)
    expect(mockCheckPermission).toHaveBeenCalledWith('SUPER_ADMIN', 'fees', 'create')
    expect(mockTx.feeInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          challanNumber: 'CHL/22/2627/JUN',
          studentId: 'student-1',
          subtotal: 6000,
          discount: 500,
          lateFee: 100,
          totalAmount: 5600,
          status: 'ISSUED',
        }),
      })
    )
    expect(mockTx.student.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: {
        dueAmount: { increment: 5600 },
        feeStatus: 'PENDING',
      },
    })
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'admin-1',
          entityType: 'FeeInvoice',
          changes: { challanNumber: 'CHL/22/2627/JUN', studentId: 'student-1', totalAmount: 5600 },
        }),
      })
    )
  })
})
