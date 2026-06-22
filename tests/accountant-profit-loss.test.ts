import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockAuth = vi.fn()

  const mockTx = {
    profitLossStatement: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    reserveFundLedger: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  }

  const mockPrisma = {
    profitLossStatement: {
      findFirst: vi.fn(),
    },
    feePayment: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    expense: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    salarySlip: {
      aggregate: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
  }

  return { mockAuth, mockPrisma, mockTx }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST } from '../app/api/accountant/profit-loss/route'

describe('POST /api/accountant/profit-loss', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } })
    mockPrisma.profitLossStatement.findFirst.mockResolvedValue(null)
    mockPrisma.feePayment.aggregate.mockResolvedValue({ _sum: { amount: 100000 } })
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 20000 } })
    mockPrisma.salarySlip.aggregate.mockResolvedValue({ _sum: { netSalary: 30000 } })
    mockPrisma.feePayment.findMany.mockResolvedValue([
      { id: 'fee-1', amount: 100000, paymentDate: new Date().toISOString(), paymentMethod: 'CASH' },
    ])
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: 'exp-1', title: 'Stationery', category: 'SUPPLIES', amount: 20000, date: new Date().toISOString() },
    ])
    mockTx.profitLossStatement.create.mockResolvedValue({ id: 'pl-1' })
    mockTx.reserveFundLedger.findFirst.mockResolvedValue({ cumulativeTotal: 10000 })
    mockTx.reserveFundLedger.create.mockResolvedValue({ id: 'ledger-1' })
    mockTx.profitLossStatement.findUnique.mockResolvedValue({
      id: 'pl-1',
      campusId: null,
      periodLabel: 'June 2026',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-30T23:59:59.000Z'),
      totalIncome: 100000,
      totalExpenses: 50000,
      grossMargin: 50000,
      profitPercentage: 20,
      superAdminAllocation: 10000,
      superAdminMonthlyDraw: 7500,
      reserveContribution: 2500,
      remainingAmount: 40000,
      generatedBy: 'admin-1',
      snapshotData: {
        incomeItems: [{ id: 'fee-1', amount: 100000, paymentDate: new Date().toISOString(), paymentMethod: 'CASH' }],
        expenseItems: [{ id: 'exp-1', title: 'Stationery', category: 'SUPPLIES', amount: 20000, date: new Date().toISOString() }],
      },
      reserveEntry: { id: 'ledger-1', contributionAmount: 2500, cumulativeTotal: 12500 },
    })
  })

  it('creates a P&L statement with correct allocation and reserve contribution', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/accountant/profit-loss', {
        method: 'POST',
        body: JSON.stringify({
          periodLabel: 'June 2026',
          periodStart: '2026-06-01T00:00:00.000Z',
          periodEnd: '2026-06-30T23:59:59.000Z',
          profitPercentage: 20,
          notes: 'June P&L snapshot',
        }),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(201)
    const json = await response.json()
    expect(json.data).toMatchObject({
      id: 'pl-1',
      totalIncome: 100000,
      totalExpenses: 50000,
      grossMargin: 50000,
      profitPercentage: 20,
      superAdminAllocation: 10000,
      superAdminMonthlyDraw: 7500,
      reserveContribution: 2500,
      remainingAmount: 40000,
    })
    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(mockTx.profitLossStatement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        totalIncome: 100000,
        totalExpenses: 50000,
        grossMargin: 50000,
        profitPercentage: 20,
        superAdminAllocation: 10000,
        superAdminMonthlyDraw: 7500,
        reserveContribution: 2500,
        remainingAmount: 40000,
      }),
    }))
    expect(mockTx.reserveFundLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        contributionAmount: 2500,
        cumulativeTotal: 12500,
      }),
    }))
  })
})
