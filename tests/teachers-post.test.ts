import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockHash, mockSendTeacherWelcomeEmail, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockHash = vi.fn()
  const mockSendTeacherWelcomeEmail = vi.fn()

  const mockTx = {
    user: { create: vi.fn() },
    teacher: { create: vi.fn() },
    class: { findMany: vi.fn() },
    classTeacher: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const mockPrisma = {
    teacher: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  }

  return { mockAuth, mockCheckPermission, mockHash, mockSendTeacherWelcomeEmail, mockPrisma, mockTx }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@node-rs/argon2', () => ({ hash: mockHash }))
vi.mock('@/lib/email', () => ({ sendTeacherWelcomeEmail: mockSendTeacherWelcomeEmail }))

import { POST } from '../app/api/teachers/route'

describe('POST /api/teachers', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockCheckPermission.mockReturnValue(true)
    mockHash.mockResolvedValue('hashed-password')
    mockSendTeacherWelcomeEmail.mockResolvedValue(undefined)
  })

  it('returns 409 when the email already belongs to an existing auth user', async () => {
    mockPrisma.teacher.findUnique.mockResolvedValue(null)
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-existing' })

    const response = await POST(
      new NextRequest('http://localhost/api/teachers', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Amina',
          lastName: 'Khan',
          cnic: '3520198765432',
          dateOfBirth: '1990-05-10T00:00:00.000Z',
          gender: 'FEMALE',
          qualification: 'M.Ed',
          specialization: 'Mathematics',
          experienceYears: 5,
          joiningDate: '2026-01-15T00:00:00.000Z',
          designation: 'Senior Teacher',
          monthlySalary: 65000,
          phoneNumber: '+923001234567',
          email: 'existing@example.com',
          address: 'House 1, Street 2',
          city: 'Lahore',
          emergencyContact: '+923001234568',
          campusId: 'clxcampus1234567890',
          batchId: 'clxbatch1234567890',
          houseId: 'clxhouse1234567890',
          password: 'StrongPass123!',
        }),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json.error.message).toContain('email already exists')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
