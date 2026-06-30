import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    salarySlip: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)) => {
      if (Array.isArray(ops)) return Promise.all(ops)
      return ops(mockPrisma)
    }),
  }

  return { mockAuth, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '../app/api/salaries/route'
import { DELETE as DELETE_SALARY } from '../app/api/salaries/[id]/route'

describe('/api/salaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockPrisma.salarySlip.count.mockResolvedValue(1)
    mockPrisma.salarySlip.findMany.mockResolvedValue([
      {
        id: 'slip-1',
        employeeId: 'teacher-user-1',
        employeeName: 'Ali Teacher',
        employeeRole: 'TEACHER',
        month: 'June 2026',
        basicSalary: 50000,
        overtimeAmount: 5000,
        totalAdditions: 55000,
        lunchDues: 1000,
        totalDeductions: 1000,
        netSalary: 54000,
        status: 'PAID',
        isDeleted: false,
      },
    ])
    mockPrisma.salarySlip.findFirst.mockResolvedValue(null)
    mockPrisma.salarySlip.findUnique.mockResolvedValue({ id: 'slip-1', isDeleted: false })
    mockPrisma.salarySlip.create.mockResolvedValue({ id: 'slip-created' })
    mockPrisma.salarySlip.update.mockResolvedValue({ id: 'slip-1', isDeleted: true })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'teacher-user-1',
      role: 'TEACHER',
      teacher: { firstName: 'Ali', lastName: 'Teacher', employeeId: 'EMP-1', designation: 'Teacher' },
      accountant: null,
    })
  })

  it('lists only active salary slips for SuperAdmin', async () => {
    const response = await GET(new NextRequest('http://localhost/api/salaries?limit=100'))

    expect(response.status).toBe(200)
    expect(mockPrisma.salarySlip.count).toHaveBeenCalledWith({ where: { isDeleted: false } })
    expect(mockPrisma.salarySlip.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isDeleted: false },
      take: 100,
    }))
  })

  it('rejects duplicate active salary slips for the same employee and month', async () => {
    mockPrisma.salarySlip.findFirst.mockResolvedValueOnce({ id: 'existing-slip' })

    const response = await POST(new NextRequest('http://localhost/api/salaries', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: 'teacher-user-1',
        month: 'June 2026',
        basicSalary: 50000,
        allowances: 0,
        deductions: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(409)
    expect(mockPrisma.salarySlip.create).not.toHaveBeenCalled()
  })

  it('rejects salary slips with negative net salary', async () => {
    const response = await POST(new NextRequest('http://localhost/api/salaries', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: 'teacher-user-1',
        month: 'June 2026',
        basicSalary: 1000,
        allowances: 0,
        deductions: 5000,
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(mockPrisma.salarySlip.create).not.toHaveBeenCalled()
  })

  it('archives salary slips instead of hard-deleting financial records', async () => {
    const response = await DELETE_SALARY(
      new NextRequest('http://localhost/api/salaries/slip-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'slip-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockPrisma.salarySlip.update).toHaveBeenCalledWith({
      where: { id: 'slip-1' },
      data: { isDeleted: true },
    })
  })
})
