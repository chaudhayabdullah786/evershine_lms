import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requirePermissionMock, requireSessionMock, teacherCanAccessClassSectionMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(async () => ({ session: { user: { id: 'teacher-1', role: 'TEACHER' } }, error: null })),
  requirePermissionMock: vi.fn(() => null),
  teacherCanAccessClassSectionMock: vi.fn(async () => true),
}))

const { timetableSlotFindFirst, subjectOfferingFindFirst } = vi.hoisted(() => ({
  timetableSlotFindFirst: vi.fn(),
  subjectOfferingFindFirst: vi.fn(),
}))

const { getActiveAcademicYearMock, getTeacherByUserIdMock } = vi.hoisted(() => ({
  getActiveAcademicYearMock: vi.fn(async () => ({ id: 'year-1' })),
  getTeacherByUserIdMock: vi.fn(async () => ({ id: 'teacher-1' })),
}))

const createTokenMock = vi.hoisted(() => vi.fn(() => 'token-123'))
const toDataUrlMock = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,abc'))

vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: requireSessionMock,
  requirePermission: requirePermissionMock,
}))

vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: getActiveAcademicYearMock,
}))

vi.mock('@/lib/academic/teacher-scope', () => ({
  getTeacherByUserId: getTeacherByUserIdMock,
  teacherCanAccessClassSection: teacherCanAccessClassSectionMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    timetableSlot: { findFirst: timetableSlotFindFirst },
    subjectOffering: { findFirst: subjectOfferingFindFirst },
  },
}))

vi.mock('@/lib/jwt-utils', () => ({
  createToken: createTokenMock,
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: toDataUrlMock },
}))

import { POST } from '@/app/api/qr-codes/generate/route'

describe('QR code generation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    timetableSlotFindFirst.mockResolvedValue(null)
    subjectOfferingFindFirst.mockResolvedValue({ id: 'offer-1' })
  })

  it('uses the teacher attendance create permission for QR generation', async () => {
    const request = new Request('http://localhost/api/qr-codes/generate', {
      method: 'POST',
      body: JSON.stringify({ classSectionId: 'section-1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(request)

    expect(requirePermissionMock).toHaveBeenCalledWith('TEACHER', 'attendance', 'create')
  })
})
