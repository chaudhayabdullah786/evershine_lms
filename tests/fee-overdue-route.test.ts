import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma, mockGetChildrenForGuardianUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPrisma: {
    student: { findUnique: vi.fn() },
    feeInvoice: { findMany: vi.fn() },
  },
  mockGetChildrenForGuardianUser: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/guardian', () => ({
  getChildrenForGuardianUser: mockGetChildrenForGuardianUser,
}))

import { GET } from '../app/api/student/fees/overdue/route'

describe('student and guardian overdue fee reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only the student outstanding balance after completed payments', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'student-user', role: 'STUDENT' } })
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'student-1', firstName: 'Ayesha', lastName: 'Khan' })
    mockPrisma.feeInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-1',
        challanNumber: 'ESA-001',
        month: 'August 2026',
        totalAmount: 3000,
        paidAmount: 3000,
        status: 'ISSUED',
        dueDate: new Date('2026-08-01T00:00:00.000Z'),
        studentId: 'student-1',
        payments: [{ amount: 3000, status: 'COMPLETED' }],
      },
      {
        id: 'invoice-2',
        challanNumber: 'ESA-002',
        month: 'July 2026',
        totalAmount: 2500,
        paidAmount: 500,
        status: 'PARTIALLY_PAID',
        dueDate: new Date('2026-07-01T00:00:00.000Z'),
        studentId: 'student-1',
        payments: [{ amount: 500, status: 'COMPLETED' }],
      },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ hasOverdue: true, overdueCount: 1, totalOverdue: 2000 })
    expect(body.invoices).toHaveLength(1)
    expect(body.invoices[0]).toMatchObject({ id: 'invoice-2', studentName: 'Ayesha Khan', outstandingAmount: 2000 })
  })

  it('aggregates overdue balances for a guardian across linked children', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'guardian-user', role: 'GUARDIAN' } })
    mockGetChildrenForGuardianUser.mockResolvedValue([
      { id: 'child-1', firstName: 'Ayesha', lastName: 'Khan' },
      { id: 'child-2', firstName: 'Bilal', lastName: 'Khan' },
    ])
    mockPrisma.feeInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-1',
        challanNumber: 'ESA-101',
        month: 'August 2026',
        totalAmount: 4000,
        paidAmount: 1000,
        status: 'OVERDUE',
        dueDate: new Date('2026-08-01T00:00:00.000Z'),
        studentId: 'child-1',
        payments: [{ amount: 1000, status: 'COMPLETED' }],
      },
      {
        id: 'invoice-2',
        challanNumber: 'ESA-102',
        month: 'August 2026',
        totalAmount: 5000,
        paidAmount: 5000,
        status: 'PAID',
        dueDate: new Date('2026-08-01T00:00:00.000Z'),
        studentId: 'child-2',
        payments: [{ amount: 5000, status: 'COMPLETED' }],
      },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ hasOverdue: true, overdueCount: 1, totalOverdue: 3000 })
    expect(body.invoices[0]).toMatchObject({ studentName: 'Ayesha Khan', outstandingAmount: 3000 })
  })

  it('does not expose the reminder endpoint to unrelated roles', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'teacher-user', role: 'TEACHER' } })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(mockPrisma.feeInvoice.findMany).not.toHaveBeenCalled()
  })
})
