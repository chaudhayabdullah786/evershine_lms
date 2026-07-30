import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { authMock, teacherFindUniqueMock, classTeacherFindManyMock, subjectTeacherFindManyMock, subjectOfferingFindManyMock, timetableSlotFindManyMock, studentCountMock, studentFindManyMock, transactionMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  teacherFindUniqueMock: vi.fn(),
  classTeacherFindManyMock: vi.fn(),
  subjectTeacherFindManyMock: vi.fn(),
  subjectOfferingFindManyMock: vi.fn(),
  timetableSlotFindManyMock: vi.fn(),
  studentCountMock: vi.fn(),
  studentFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
    teacher: { findUnique: teacherFindUniqueMock },
    classTeacher: { findMany: classTeacherFindManyMock },
    subjectTeacher: { findMany: subjectTeacherFindManyMock },
    subjectOffering: { findMany: subjectOfferingFindManyMock },
    timetableSlot: { findMany: timetableSlotFindManyMock },
    student: { count: studentCountMock, findMany: studentFindManyMock },
  },
}))

import { GET } from '@/app/api/teacher-portal/my-students/route'

describe('teacher-portal/my-students', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts classSectionId and returns the teacher roster for that section', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    classTeacherFindManyMock.mockResolvedValue([])
    subjectTeacherFindManyMock.mockResolvedValue([])
    subjectOfferingFindManyMock.mockResolvedValue([{ classSectionId: 'section-1' }])
    timetableSlotFindManyMock.mockResolvedValue([])
    studentCountMock.mockResolvedValue(1)
    transactionMock.mockImplementation(async (queries) => [1, await queries[1]])
    studentFindManyMock.mockResolvedValue([
      {
        id: 'student-1',
        registrationNumber: 'REG-1',
        rollNumber: '1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        fatherName: 'Unknown',
        gender: 'FEMALE',
        dateOfBirth: null,
        enrollmentStatus: 'ACTIVE',
        profilePicture: null,
        phoneNumber: null,
        email: null,
        section: null,
        academicYear: null,
        admissionDate: null,
        campus: null,
        batch: null,
        class: null,
        house: null,
        enrollments: [],
      },
    ])

    const response = await GET(new Request('http://localhost/api/teacher-portal/my-students?classSectionId=section-1&limit=10') as unknown as NextRequest)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(studentFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { classId: { in: [] } },
                {
                  enrollments: {
                    some: {
                      classSectionId: { in: ['section-1'] },
                      status: 'ACTIVE',
                    },
                  },
                },
              ],
            },
          ],
        }),
        select: expect.objectContaining({
          enrollments: expect.objectContaining({
            where: {
              status: 'ACTIVE',
              classSectionId: { in: ['section-1'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          }),
        }),
      })
    )
  })

  it('returns an empty result for a section outside the teacher scope', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    classTeacherFindManyMock.mockResolvedValue([{ classId: 'legacy-class-1' }])
    subjectTeacherFindManyMock.mockResolvedValue([])
    subjectOfferingFindManyMock.mockResolvedValue([{ classSectionId: 'section-1' }])
    timetableSlotFindManyMock.mockResolvedValue([])

    const response = await GET(
      new Request(
        'http://localhost/api/teacher-portal/my-students?classSectionId=other-section&limit=10'
      ) as unknown as NextRequest
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.pagination.total).toBe(0)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(studentFindManyMock).not.toHaveBeenCalled()
  })

  it('includes timetable-based assignments when resolving teacher student scope', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    classTeacherFindManyMock.mockResolvedValue([])
    subjectTeacherFindManyMock.mockResolvedValue([])
    subjectOfferingFindManyMock.mockResolvedValue([])
    timetableSlotFindManyMock.mockResolvedValue([{ classSectionId: 'section-1' }])
    studentCountMock.mockResolvedValue(0)
    transactionMock.mockImplementation(async (queries) => [0, await queries[1]])
    studentFindManyMock.mockResolvedValue([])

    const response = await GET(new Request('http://localhost/api/teacher-portal/my-students?limit=10') as unknown as NextRequest)

    expect(response.status).toBe(200)
    expect(timetableSlotFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teacherId: 'teacher-1', isPublished: true }),
        select: { classSectionId: true },
      })
    )
  })
})
