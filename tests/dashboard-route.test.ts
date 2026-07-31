import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    user: { findUnique: vi.fn() },
    student: { count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    teacher: { count: vi.fn() },
    feePayment: { aggregate: vi.fn() },
    feeInvoice: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    enrollmentAttendanceRecord: { findMany: vi.fn() },
    exam: { findMany: vi.fn() },
    reserveFundLedger: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  }

  return { mockAuth, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET } from '../app/api/dashboard/route'

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'super-1', role: 'SUPER_ADMIN' } })
    mockPrisma.user.findUnique.mockResolvedValue({ isActive: true })
    mockPrisma.student.count.mockReturnValue({})
    mockPrisma.teacher.count.mockReturnValue({})
    mockPrisma.feePayment.aggregate.mockReturnValue({})
    mockPrisma.feeInvoice.findMany.mockReturnValue({})
    mockPrisma.attendance.findMany.mockReturnValue({})
    mockPrisma.enrollmentAttendanceRecord.findMany.mockReturnValue({})
    mockPrisma.exam.findMany.mockReturnValue({})
    mockPrisma.student.findMany.mockReturnValue({})
    mockPrisma.reserveFundLedger.findFirst.mockResolvedValue(null)
  })

  it('computes fee dashboard metrics from invoice and payment ledgers', async () => {
    const futureDueDate = new Date()
    futureDueDate.setDate(futureDueDate.getDate() + 30)

    mockPrisma.$transaction.mockResolvedValue([
      86,
      84,
      12,
      { _sum: { amount: 12500 } },
      [
        { studentId: 'student-1', status: 'ISSUED', dueDate: futureDueDate, totalAmount: 5000, paidAmount: 1000 },
        { studentId: 'student-2', status: 'OVERDUE', dueDate: new Date('2026-07-01T00:00:00.000Z'), totalAmount: 6000, paidAmount: 0 },
        { studentId: 'student-2', status: 'PARTIALLY_PAID', dueDate: new Date('2026-07-25T00:00:00.000Z'), totalAmount: 3000, paidAmount: 3000 },
      ],
      [],
      [],
      [],
      [],
    ])
    mockPrisma.reserveFundLedger.findFirst.mockResolvedValue({
      cumulativeTotal: 2500,
      contributionAmount: 500,
      periodLabel: 'July 2026',
      transactionDate: new Date('2026-07-08T00:00:00.000Z'),
    })

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mockPrisma.feeInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ['PAID', 'CANCELLED'] } }),
      })
    )
    expect(json.data.finance.totalCollected).toBe(12500)
    expect(json.data.finance.totalPending).toBe(10000)
    expect(json.data.students.feePending).toBe(2)
    expect(json.data.students.feeOverdue).toBe(1)
    expect(json.data.finance.metricSource).toBe('fee_invoices_and_payments')
  })

  it('uses active students as attendance denominator and counts distinct present students', async () => {
    mockPrisma.$transaction.mockResolvedValue([
      4,
      3,
      2,
      { _sum: { amount: 0 } },
      [],
      [{ studentId: 'student-1' }, { studentId: 'student-2' }],
      [
        { studentEnrollment: { studentId: 'student-2' } },
        { studentEnrollment: { studentId: 'student-3' } },
      ],
      [],
      [],
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.attendance.todayPresent).toBe(3)
    expect(json.data.attendance.todayTotal).toBe(3)
    expect(json.data.attendance.attendanceRate).toBe(100)
    expect(json.data.attendance.metricSource).toBe('student_attendance_records')
  })
})
