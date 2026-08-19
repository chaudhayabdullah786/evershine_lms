import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma, mockBuildPaidListReport, mockBuildDefaulterListReport } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    accountant: { findUnique: vi.fn() },
    feeInvoice: { findMany: vi.fn() },
  }
  const mockBuildPaidListReport = vi.fn()
  const mockBuildDefaulterListReport = vi.fn()
  return { mockAuth, mockPrisma, mockBuildPaidListReport, mockBuildDefaulterListReport }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/excel/fee-lists', () => ({
  buildPaidListReport: mockBuildPaidListReport,
  buildDefaulterListReport: mockBuildDefaulterListReport,
}))

import { GET as getPaidExport } from '../app/api/accountant/fees/export/paid/route'
import { GET as getDefaulterExport } from '../app/api/accountant/fees/export/defaulters/route'

const workbookFor = (payload: string) => ({
  xlsx: { writeBuffer: vi.fn().mockResolvedValue(Buffer.from(payload)) },
})

describe('fee Excel export routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'super-admin-1', role: 'SUPER_ADMIN', campusId: null } })
    mockBuildPaidListReport.mockResolvedValue(workbookFor('paid-xlsx'))
    mockBuildDefaulterListReport.mockResolvedValue(workbookFor('defaulters-xlsx'))
  })

  it('queries collected invoices by academic-year month and returns a non-empty workbook', async () => {
    const invoice = { id: 'invoice-1', month: 'August 2025' }
    mockPrisma.feeInvoice.findMany.mockResolvedValue([invoice])

    const response = await getPaidExport(
      new NextRequest('http://localhost/api/accountant/fees/export/paid?month=August%202025&academicYear=2025-2026')
    )

    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('paid-xlsx')
    expect(mockPrisma.feeInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
        month: 'August 2025',
        academicYear: '2025-2026',
        OR: [
          { paidAmount: { gt: 0 } },
          { payments: { some: { status: 'COMPLETED' } } },
        ],
      }),
      include: expect.objectContaining({
        payments: { orderBy: { paymentDate: 'desc' } },
      }),
    }))
    expect(mockBuildPaidListReport).toHaveBeenCalledWith([invoice], 'August 2025')
  })

  it('calculates defaulters from invoice balances and returns a non-empty workbook', async () => {
    const invoice = {
      id: 'invoice-2',
      studentId: 'student-1',
      totalAmount: 1500,
      paidAmount: 0,
      status: 'PARTIALLY_PAID',
      student: {
        id: 'student-1',
        registrationNumber: 'ESA/25/0001',
        firstName: 'Ayesha',
        lastName: 'Khan',
        dueAmount: 0,
        campus: { name: 'Main Campus' },
        class: { name: 'Class 10' },
        section: 'A',
      },
      payments: [{ amount: 500, status: 'COMPLETED' }],
    }
    mockPrisma.feeInvoice.findMany.mockResolvedValue([invoice])

    const response = await getDefaulterExport(
      new NextRequest('http://localhost/api/accountant/fees/export/defaulters?academicYear=2025-2026')
    )

    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('defaulters-xlsx')
    expect(mockPrisma.feeInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'] },
        academicYear: '2025-2026',
      }),
      include: expect.objectContaining({
        payments: { orderBy: { paymentDate: 'desc' } },
      }),
    }))
    expect(mockBuildDefaulterListReport).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'student-1',
        dueAmount: 1000,
        invoices: [invoice],
      }),
    ])
  })

  it('keeps accountant exports inside the accountant campus boundary', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'accountant-1', role: 'ACCOUNTANT', campusId: 'session-campus' } })
    mockPrisma.accountant.findUnique.mockResolvedValue({ campusId: 'accountant-campus' })
    mockPrisma.feeInvoice.findMany.mockResolvedValue([])

    const response = await getPaidExport(
      new NextRequest('http://localhost/api/accountant/fees/export/paid?month=August%202025&academicYear=2025-2026')
    )

    expect(response.status).toBe(200)
    expect(mockPrisma.feeInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        student: expect.objectContaining({ campusId: 'accountant-campus' }),
      }),
    }))
  })
})
