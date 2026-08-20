import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const {
  requireSessionMock,
  requirePermissionMock,
  teacherFindUniqueMock,
  assertEditableMock,
  transactionMock,
  slotFindManyMock,
  slotDeleteManyMock,
  auditCreateMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  teacherFindUniqueMock: vi.fn(),
  assertEditableMock: vi.fn(),
  transactionMock: vi.fn(),
  slotFindManyMock: vi.fn(),
  slotDeleteManyMock: vi.fn(),
  auditCreateMock: vi.fn(),
}))

vi.mock('@/lib/academic/api-helpers', () => ({
  requireSession: requireSessionMock,
  requirePermission: requirePermissionMock,
}))
vi.mock('@/lib/academic/engine', () => ({
  assertAcademicYearEditable: assertEditableMock,
  validateTimetableSlot: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: teacherFindUniqueMock },
    $transaction: transactionMock,
  },
}))

import { DELETE as deletePublishedTeacherSlots } from '@/app/api/timetable/slots/route'

describe('bulk teacher timetable replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirePermissionMock.mockReturnValue(null)
    requireSessionMock.mockResolvedValue({
      session: { user: { id: 'admin-user', role: 'SUPER_ADMIN' } },
      error: null,
    })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    assertEditableMock.mockResolvedValue(undefined)
    slotFindManyMock.mockResolvedValue([{ id: 'slot-1' }, { id: 'slot-2' }])
    slotDeleteManyMock.mockResolvedValue({ count: 2 })
    auditCreateMock.mockResolvedValue({ id: 'audit-1' })
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      timetableSlot: {
        findMany: slotFindManyMock,
        deleteMany: slotDeleteManyMock,
      },
      auditLog: { create: auditCreateMock },
    }))
  })

  it('deletes only published slots for the selected teacher and year', async () => {
    const response = await deletePublishedTeacherSlots(new Request(
      'http://localhost/api/timetable/slots?teacherId=teacher-1&academicYearId=year-1&published=true'
    ) as unknown as NextRequest)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual({ deletedCount: 2 })
    expect(slotFindManyMock).toHaveBeenCalledWith({
      where: {
        academicYearId: 'year-1',
        teacherId: 'teacher-1',
        isPublished: true,
      },
      select: { id: true },
    })
    expect(slotDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ['slot-1', 'slot-2'] } } })
    expect(auditCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: 'TimetableSlotBulkReplacement',
        entityId: 'teacher-1',
      }),
    }))
  })

  it('requires the explicit published=true safety guard', async () => {
    const response = await deletePublishedTeacherSlots(new Request(
      'http://localhost/api/timetable/slots?teacherId=teacher-1&academicYearId=year-1'
    ) as unknown as NextRequest)

    expect(response.status).toBe(400)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('allows only Superadmin to perform the bulk replacement', async () => {
    requireSessionMock.mockResolvedValue({
      session: { user: { id: 'admin-user', role: 'ADMIN' } },
      error: null,
    })

    const response = await deletePublishedTeacherSlots(new Request(
      'http://localhost/api/timetable/slots?teacherId=teacher-1&academicYearId=year-1&published=true'
    ) as unknown as NextRequest)

    expect(response.status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('does not write an audit row when no published slots exist', async () => {
    slotFindManyMock.mockResolvedValue([])

    const response = await deletePublishedTeacherSlots(new Request(
      'http://localhost/api/timetable/slots?teacherId=teacher-1&academicYearId=year-1&published=true'
    ) as unknown as NextRequest)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual({ deletedCount: 0 })
    expect(slotDeleteManyMock).not.toHaveBeenCalled()
    expect(auditCreateMock).not.toHaveBeenCalled()
  })
})
