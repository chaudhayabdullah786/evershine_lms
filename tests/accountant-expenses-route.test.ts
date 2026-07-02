import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma, mockGetExpenseColumnSupport } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockGetExpenseColumnSupport = vi.fn()
  const mockPrisma = {
    accountant: { findUnique: vi.fn() },
    expense: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return { mockAuth, mockPrisma, mockGetExpenseColumnSupport }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/accounting/expense-columns', () => ({
  getExpenseColumnSupport: mockGetExpenseColumnSupport,
  isExpensePaymentColumnMissingError: vi.fn(() => false),
}))

import { POST } from '../app/api/accountant/expenses/route'

describe('POST /api/accountant/expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'super-user-1', role: 'SUPER_ADMIN', campusId: null } })
    mockPrisma.accountant.findUnique.mockResolvedValue(null)
    mockGetExpenseColumnSupport.mockResolvedValue({ paymentSource: true, paymentReference: true })
    mockPrisma.expense.create.mockResolvedValue({ id: 'expense-1', title: 'Furniture' })
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  it('records SuperAdmin expenses with real user attribution even without an Accountant row', async () => {
    const response = await POST(new NextRequest('http://localhost/api/accountant/expenses', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Furniture',
        description: 'Chairs and tables',
        amount: 200,
        category: 'EQUIPMENT',
        date: '2026-07-02',
        campusId: 'clxcampus1234567890',
        paymentSource: 'Cash',
        paymentReference: '2122',
        notes: 'Added to campus ledger',
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(mockPrisma.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordedBy: null,
        recordedByUserId: 'super-user-1',
        approvedBy: 'super-user-1',
        campusId: 'clxcampus1234567890',
      }),
    })
  })
})
