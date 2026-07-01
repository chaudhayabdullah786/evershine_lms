import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockTx = {
    certificate: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const mockPrisma = {
    student: { findUnique: vi.fn() },
    certificate: { findMany: vi.fn() },
    teacherDocument: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    teacher: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    guardian: { findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>> | ((tx: typeof mockTx) => Promise<unknown>)) => {
      if (Array.isArray(ops)) return Promise.all(ops)
      return ops(mockTx)
    }),
  }

  return { mockAuth, mockCheckPermission, mockPrisma, mockTx }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST as postStudentDocument } from '../app/api/documents/route'
import { GET as getTeacherDocuments } from '../app/api/documents/teacher/route'

describe('document generation audit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckPermission.mockReturnValue(true)
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN', campusId: null } })
    mockPrisma.student.findUnique.mockResolvedValue({ id: 'clxstudent000000000001' })
    mockTx.certificate.create.mockResolvedValue({ id: 'clxcert00000000000001', type: 'STUDENT_PROFILE' })
    mockTx.auditLog.create.mockResolvedValue({ id: 'clxaudit0000000000001' })
    mockPrisma.teacherDocument.count.mockResolvedValue(0)
    mockPrisma.teacherDocument.findMany.mockResolvedValue([])
  })

  it('allows SuperAdmin to save a generated student profile document audit record', async () => {
    const response = await postStudentDocument(new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      body: JSON.stringify({
        studentId: 'clxstudent000000000001',
        type: 'STUDENT_PROFILE',
        title: 'Generated student profile',
        pdfUrl: 'https://res.cloudinary.com/demo/student-profile.pdf',
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(mockTx.certificate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STUDENT_PROFILE' }),
    }))
  })

  it('scopes Admin teacher document lists to their campus', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', campusId: 'clxcampus000000000001' } })

    const response = await getTeacherDocuments(new NextRequest('http://localhost/api/documents/teacher?type=TEACHER_PROFILE'))

    expect(response.status).toBe(200)
    expect(mockPrisma.teacherDocument.count).toHaveBeenCalledWith({
      where: {
        type: 'TEACHER_PROFILE',
        teacher: { campusId: 'clxcampus000000000001' },
      },
    })
  })
})
