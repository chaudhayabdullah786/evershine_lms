import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockHash, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockHash = vi.fn()

  const mockPrisma = {
    student: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return { mockAuth, mockCheckPermission, mockHash, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@node-rs/argon2', () => ({ hash: mockHash }))
vi.mock('@/lib/students/enrollment-sync', () => ({ ensureActiveYearEnrollment: vi.fn() }))
vi.mock('@/lib/students/guardian-link', () => ({ linkGuardianToStudentDirect: vi.fn() }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: vi.fn() }))

import { POST } from '../app/api/students/route'

const validPayload = {
  firstName: 'Ali',
  lastName: 'Hassan',
  fatherName: 'Hassan',
  cnicBForm: '3530198546250',
  dateOfBirth: '2012-04-15T00:00:00.000Z',
  gender: 'MALE',
  bloodGroup: 'O+',
  nationality: 'Pakistani',
  address: 'House 1, Street 2, City',
  city: 'Gujranwala',
  province: 'Punjab',
  phoneNumber: '+923220652321',
  emergencyContact: '+923220652321',
  previousSchool: 'Allied School',
  campusId: 'clxcampus1234567890',
  batchId: 'clxbatch1234567890',
  academicYear: '2026-2027',
  totalFeeAmount: 5000,
  guardianFirstName: 'Ali',
  guardianLastName: 'Hassan',
  guardianCnic: '3530198546250',
  guardianPhone: '+923220652321',
  guardianEmail: 'alihassan@example.com',
  guardianRelationship: 'Father',
  guardianEmploymentStatus: 'NONE',
  sourceOfInfo: 'Banners',
}

describe('POST /api/students schema drift handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockCheckPermission.mockReturnValue(true)
    mockHash.mockResolvedValue('hashed-password')
    mockPrisma.student.findUnique.mockResolvedValue(null)
    mockPrisma.student.count.mockResolvedValue(42)
  })

  it('returns a clear migration error when production Student schema is missing a column', async () => {
    mockPrisma.$transaction.mockRejectedValue({
      code: 'P2022',
      meta: { column: 'Student.previousSchool' },
    })

    const response = await POST(
      new NextRequest('http://localhost/api/students', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.error.code).toBe('SCHEMA_OUT_OF_DATE')
    expect(json.error.message).toContain('student admission database schema is out of date')
  })
})
