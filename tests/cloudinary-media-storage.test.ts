import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuth,
  mockCheckPermission,
  mockPrisma,
  mockStudentTx,
  mockTeacherTx,
  mockFeeTx,
  mockIsAllowedPaymentProof,
  mockUploadPaymentProofToCloudinary,
  mockUploadProfileImageToCloudinary,
} = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockUploadProfileImageToCloudinary = vi.fn()
  const mockUploadPaymentProofToCloudinary = vi.fn()
  const mockIsAllowedPaymentProof = vi.fn()

  const mockStudentTx = {
    class: { findUnique: vi.fn() },
    student: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const mockTeacherTx = {
    teacher: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const mockFeeTx = {
    feeInvoice: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const mockPrisma = {
    student: { findUnique: vi.fn(), findFirst: vi.fn() },
    teacher: { findUnique: vi.fn() },
    feeInvoice: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  }

  return {
    mockAuth,
    mockCheckPermission,
    mockPrisma,
    mockStudentTx,
    mockTeacherTx,
    mockFeeTx,
    mockIsAllowedPaymentProof,
    mockUploadPaymentProofToCloudinary,
    mockUploadProfileImageToCloudinary,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/cloudinary', () => ({
  isProfileImageDataUrl: (value: string | null | undefined) =>
    typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value),
  isAllowedPaymentProof: mockIsAllowedPaymentProof,
  uploadPaymentProofToCloudinary: mockUploadPaymentProofToCloudinary,
  uploadProfileImageToCloudinary: mockUploadProfileImageToCloudinary,
}))

import { PATCH as updateStudent } from '../app/api/students/[id]/route'
import { PATCH as updateTeacher } from '../app/api/teachers/[id]/route'
import { POST as uploadFeeProof } from '../app/api/fees/[id]/proof/route'

const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
const cloudinaryProfileUrl = 'https://res.cloudinary.com/evershine/students/profile.webp'
const cloudinaryProofUrl = 'https://res.cloudinary.com/evershine/fee-proofs/proof.png'

describe('Cloudinary media storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN', campusId: null } })
    mockCheckPermission.mockReturnValue(true)
    mockUploadProfileImageToCloudinary.mockResolvedValue(cloudinaryProfileUrl)
    mockUploadPaymentProofToCloudinary.mockResolvedValue(cloudinaryProofUrl)
    mockIsAllowedPaymentProof.mockReturnValue(true)
  })

  it('uploads edited student profile images before saving the student record', async () => {
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'student-1', registrationNumber: 'ESA/2026/0043' })
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockStudentTx) => Promise<unknown>) => cb(mockStudentTx))
    mockStudentTx.student.update.mockResolvedValue({ id: 'student-1', registrationNumber: 'ESA/2026/0043', enrollmentStatus: 'ACTIVE' })
    mockStudentTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })

    const response = await updateStudent(
      new NextRequest('http://localhost/api/students/student-1', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Ali', profilePicture: pngDataUrl }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'student-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockUploadProfileImageToCloudinary).toHaveBeenCalledWith(pngDataUrl, 'students', 'ESA/2026/0043')
    expect(mockStudentTx.student.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ profilePicture: cloudinaryProfileUrl }),
    }))
    expect(mockStudentTx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        changes: expect.objectContaining({ profilePicture: cloudinaryProfileUrl }),
      }),
    }))
  })

  it('uploads edited staff profile images before saving the teacher record', async () => {
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1', campusId: 'campus-1', employeeId: 'ESA-TCH-008' })
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTeacherTx) => Promise<unknown>) => cb(mockTeacherTx))
    mockTeacherTx.teacher.update.mockResolvedValue({ id: 'teacher-1', employeeId: 'ESA-TCH-008' })
    mockTeacherTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })

    const response = await updateTeacher(
      new NextRequest('http://localhost/api/teachers/teacher-1', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Amina', profilePicture: pngDataUrl }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'teacher-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockUploadProfileImageToCloudinary).toHaveBeenCalledWith(pngDataUrl, 'teachers', 'ESA-TCH-008')
    expect(mockTeacherTx.teacher.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ profilePicture: cloudinaryProfileUrl }),
    }))
    expect(mockTeacherTx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        changes: expect.objectContaining({ profilePicture: cloudinaryProfileUrl }),
      }),
    }))
  })

  it('uploads payment proof files to Cloudinary before marking the invoice proof pending', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'student-user-1', role: 'STUDENT' } })
    mockPrisma.feeInvoice.findUnique.mockResolvedValue({ id: 'invoice-1', studentId: 'student-1', status: 'ISSUED' })
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'student-1' })
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockFeeTx) => Promise<unknown>) => cb(mockFeeTx))
    mockFeeTx.feeInvoice.update.mockResolvedValue({ id: 'invoice-1', proofUrl: cloudinaryProofUrl, proofStatus: 'PENDING' })
    mockFeeTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })

    const formData = new FormData()
    formData.append('file', new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])], 'proof.png', { type: 'image/png' }))
    formData.append('remarks', 'Bank transfer screenshot')

    const response = await uploadFeeProof(
      new Request('http://localhost/api/fees/invoice-1/proof', {
        method: 'POST',
        body: formData,
      }) as NextRequest,
      { params: Promise.resolve({ id: 'invoice-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockUploadPaymentProofToCloudinary).toHaveBeenCalledWith(expect.any(Buffer), expect.stringMatching(/^invoice-1-/))
    expect(mockFeeTx.feeInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        proofUrl: cloudinaryProofUrl,
        proofRemarks: 'Bank transfer screenshot',
        proofStatus: 'PENDING',
      }),
    }))
  })
})
