import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuth,
  mockCheckPermission,
  mockHash,
  mockPrisma,
  mockStudentTx,
  mockTeacherTx,
  mockUploadProfileImageToCloudinary,
  mockLinkGuardianToStudentDirect,
  mockEnsureActiveYearEnrollment,
  mockSendTeacherWelcomeEmail,
} = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockHash = vi.fn()
  const mockUploadProfileImageToCloudinary = vi.fn()
  const mockLinkGuardianToStudentDirect = vi.fn()
  const mockEnsureActiveYearEnrollment = vi.fn()
  const mockSendTeacherWelcomeEmail = vi.fn()

  const mockStudentTx = {
    user: { create: vi.fn() },
    student: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const mockTeacherTx = {
    user: { create: vi.fn() },
    teacher: { create: vi.fn() },
    class: { findMany: vi.fn() },
    classTeacher: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const mockPrisma = {
    student: { findUnique: vi.fn(), count: vi.fn() },
    teacher: { findUnique: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  }

  return {
    mockAuth,
    mockCheckPermission,
    mockHash,
    mockPrisma,
    mockStudentTx,
    mockTeacherTx,
    mockUploadProfileImageToCloudinary,
    mockLinkGuardianToStudentDirect,
    mockEnsureActiveYearEnrollment,
    mockSendTeacherWelcomeEmail,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@node-rs/argon2', () => ({ hash: mockHash }))
vi.mock('@/lib/cloudinary', () => ({
  isProfileImageDataUrl: (value: string | null | undefined) =>
    typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value),
  uploadProfileImageToCloudinary: mockUploadProfileImageToCloudinary,
}))
vi.mock('@/lib/students/enrollment-sync', () => ({
  ensureActiveYearEnrollment: mockEnsureActiveYearEnrollment,
}))
vi.mock('@/lib/students/guardian-link', () => ({
  linkGuardianToStudentDirect: mockLinkGuardianToStudentDirect,
}))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendTeacherWelcomeEmail: mockSendTeacherWelcomeEmail }))

import { POST as createStudent } from '../app/api/students/route'
import { POST as createTeacher } from '../app/api/teachers/route'

const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'

const studentPayload = {
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
  profilePicture: pngDataUrl,
}

const teacherPayload = {
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
  email: 'new.teacher@example.com',
  address: 'House 1, Street 2',
  city: 'Lahore',
  emergencyContact: '+923001234568',
  campusId: 'clxcampus1234567890',
  batchId: 'clxbatch1234567890',
  houseId: 'clxhouse1234567890',
  password: 'StrongPass123!',
  profilePicture: pngDataUrl,
}

describe('Cloudinary profile image storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockCheckPermission.mockReturnValue(true)
    mockHash.mockResolvedValue('hashed-password')
    mockUploadProfileImageToCloudinary.mockResolvedValue('https://res.cloudinary.com/evershine/profile.webp')
    mockLinkGuardianToStudentDirect.mockResolvedValue({ guardianId: 'clxguardian000000001' })
    mockEnsureActiveYearEnrollment.mockResolvedValue(null)
    mockSendTeacherWelcomeEmail.mockResolvedValue(undefined)
  })

  it('uploads direct student profile image data URLs before persisting the student record', async () => {
    mockPrisma.student.findUnique.mockResolvedValue(null)
    mockPrisma.student.count.mockResolvedValue(42)
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockStudentTx) => Promise<unknown>) => cb(mockStudentTx))
    mockStudentTx.user.create.mockResolvedValue({ id: 'student-user-1' })
    mockStudentTx.student.create.mockResolvedValue({ id: 'student-1', registrationNumber: 'ESA/2026/0043' })
    mockStudentTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })

    const response = await createStudent(new NextRequest('http://localhost/api/students', {
      method: 'POST',
      body: JSON.stringify(studentPayload),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(mockUploadProfileImageToCloudinary).toHaveBeenCalledWith(
      pngDataUrl,
      'students',
      'ESA/2026/0043'
    )
    expect(mockStudentTx.student.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        profilePicture: 'https://res.cloudinary.com/evershine/profile.webp',
      }),
    }))
  })

  it('uploads direct teacher profile image data URLs before persisting the staff record', async () => {
    mockPrisma.teacher.findUnique.mockResolvedValue(null)
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.teacher.count.mockResolvedValue(7)
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTeacherTx) => Promise<unknown>) => cb(mockTeacherTx))
    mockTeacherTx.user.create.mockResolvedValue({ id: 'teacher-user-1' })
    mockTeacherTx.teacher.create.mockResolvedValue({ id: 'teacher-1', employeeId: 'ESA-TCH-008' })
    mockTeacherTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })

    const response = await createTeacher(new NextRequest('http://localhost/api/teachers', {
      method: 'POST',
      body: JSON.stringify(teacherPayload),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(mockUploadProfileImageToCloudinary).toHaveBeenCalledWith(
      pngDataUrl,
      'teachers',
      'ESA-TCH-008'
    )
    expect(mockTeacherTx.teacher.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        profilePicture: 'https://res.cloudinary.com/evershine/profile.webp',
      }),
    }))
  })
})
