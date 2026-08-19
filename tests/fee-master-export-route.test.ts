import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockPrisma, mockGetActiveAcademicYear, mockCanonicalStudentClassSection, mockSerializePaymentDetails } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockPrisma = { feeInvoice: { findMany: vi.fn() } }
  const mockGetActiveAcademicYear = vi.fn()
  const mockCanonicalStudentClassSection = vi.fn()
  const mockSerializePaymentDetails = vi.fn()
  return { mockAuth, mockCheckPermission, mockPrisma, mockGetActiveAcademicYear, mockCanonicalStudentClassSection, mockSerializePaymentDetails }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: mockGetActiveAcademicYear }))
vi.mock('@/lib/academic/record-formatters', () => ({ getCanonicalStudentClassSection: mockCanonicalStudentClassSection }))
vi.mock('@/lib/fees/payment-details', () => ({ serializePaymentDetails: mockSerializePaymentDetails }))

import { GET } from '../app/api/exports/fees/route'

describe('GET /api/exports/fees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'super-admin-1', role: 'SUPER_ADMIN', campusId: null } })
    mockCheckPermission.mockReturnValue(true)
    mockGetActiveAcademicYear.mockResolvedValue(null)
    mockCanonicalStudentClassSection.mockReturnValue('Class 10 - A')
    mockSerializePaymentDetails.mockReturnValue('academy-payment-details')
    mockPrisma.feeInvoice.findMany.mockResolvedValue([
      {
        challanNumber: 'CHL-1',
        month: 'August 2025',
        academicYear: '2025-2026',
        dueDate: new Date('2025-08-10T00:00:00.000Z'),
        subtotal: 1500,
        discount: 0,
        lateFee: 0,
        totalAmount: 1500,
        paidAmount: 900,
        status: 'PARTIALLY_PAID',
        proofStatus: null,
        bankAccounts: null,
        createdAt: new Date('2025-08-01T00:00:00.000Z'),
        payments: [
          { amount: 500, status: 'COMPLETED' },
          { amount: 400, status: 'FAILED' },
        ],
        student: {
          registrationNumber: 'ESA/25/0001',
          firstName: 'Ayesha',
          lastName: 'Khan',
          campus: { name: 'Main Campus' },
          class: { name: 'Class 10' },
          section: 'A',
          enrollments: [],
        },
      },
    ])
  })

  it('exports canonical paid and outstanding amounts from payment rows', async () => {
    const response = await GET(new NextRequest('http://localhost/api/exports/fees'))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data).toEqual([
      expect.objectContaining({
        challanNumber: 'CHL-1',
        paidAmount: 500,
        remainingDues: 1000,
        status: 'PARTIAL',
        classSection: 'Class 10 - A',
        bankAccounts: 'academy-payment-details',
      }),
    ])
    expect(mockPrisma.feeInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        payments: { select: { amount: true, status: true } },
      }),
    }))
  })
})
