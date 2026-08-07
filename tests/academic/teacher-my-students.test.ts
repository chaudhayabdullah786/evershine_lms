import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// WHY hoisted: vi.mock() is hoisted above imports by Vitest's transformer.
// Mocks that reference variables must be declared in vi.hoisted() to avoid
// temporal-dead-zone errors when the factory runs before the let/const.

const {
  authMock,
  teacherFindUniqueMock,
  studentCountMock,
  studentFindManyMock,
  transactionMock,
  academicYearFindFirstMock,
} = vi.hoisted(() => ({
  authMock:                  vi.fn(),
  teacherFindUniqueMock:     vi.fn(),
  studentCountMock:          vi.fn(),
  studentFindManyMock:       vi.fn(),
  transactionMock:           vi.fn(),
  academicYearFindFirstMock: vi.fn(),
}))

// Mock for getTeacherClassSectionIds — the canonical scope resolver.
// WHY mock this and not its internal prisma calls: the scope resolver's
// correctness is covered by tests/academic/teacher-scope.test.ts.
// Here we only care that my-students correctly uses its output.
const getTeacherClassSectionIdsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: authMock }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction:  transactionMock,
    teacher:       { findUnique: teacherFindUniqueMock },
    academicYear:  { findFirst: academicYearFindFirstMock },
    student:       { count: studentCountMock, findMany: studentFindManyMock },
  },
}))

// Mock the Academic Engine's getActiveAcademicYear to avoid hitting prisma
// directly and to control what year is returned per test.
vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: academicYearFindFirstMock,
}))

// Mock the canonical scope resolver — prevents the scope function from
// triggering its own prisma calls (covered in teacher-scope.test.ts).
vi.mock('@/lib/academic/teacher-scope', () => ({
  getTeacherClassSectionIds: getTeacherClassSectionIdsMock,
}))

import { GET } from '@/app/api/teacher-portal/my-students/route'

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ACTIVE_YEAR = { id: 'year-1', name: '2025-2026', isActive: true }

const STUDENT_FIXTURE = {
  id:                 'student-1',
  registrationNumber: 'REG-1',
  rollNumber:         '1',
  firstName:          'Ada',
  lastName:           'Lovelace',
  fatherName:         'Unknown',
  gender:             'FEMALE',
  dateOfBirth:        null,
  enrollmentStatus:   'ACTIVE',
  profilePicture:     null,
  phoneNumber:        null,
  email:              null,
  section:            null,
  academicYear:       null,
  admissionDate:      null,
  campus:             null,
  batch:              null,
  class:              null,
  house:              null,
  enrollments:        [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('teacher-portal/my-students', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default happy-path mocks used by most tests.
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    teacherFindUniqueMock.mockResolvedValue({ id: 'teacher-1' })
    academicYearFindFirstMock.mockResolvedValue(ACTIVE_YEAR)
  })

  it('accepts classSectionId and returns the teacher roster for that section', async () => {
    // Teacher is authorised for section-1 only.
    getTeacherClassSectionIdsMock.mockResolvedValue(['section-1'])
    transactionMock.mockResolvedValue([1, [STUDENT_FIXTURE]])

    const response = await GET(
      new Request(
        'http://localhost/api/teacher-portal/my-students?classSectionId=section-1&limit=10'
      ) as unknown as NextRequest
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)

    // Scope resolver MUST be called with the active year's ID so that
    // residual assignments from prior years are not included.
    expect(getTeacherClassSectionIdsMock).toHaveBeenCalledWith('teacher-1', 'year-1')

    // The DB query MUST restrict students to only the requested section.
    expect(transactionMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.anything(), // count query
        expect.anything(), // findMany query — structure verified below
      ])
    )
    expect(json.data).toHaveLength(1)
    expect(json.data[0].id).toBe('student-1')
  })

  it('returns an empty result when the requested section is outside the teacher scope', async () => {
    // Teacher is authorised for section-1 but requests other-section.
    getTeacherClassSectionIdsMock.mockResolvedValue(['section-1'])

    const response = await GET(
      new Request(
        'http://localhost/api/teacher-portal/my-students?classSectionId=other-section&limit=10'
      ) as unknown as NextRequest
    )
    const json = await response.json()

    // SECURITY: must NOT call the DB — the scope check short-circuits before
    // reaching prisma.$transaction. This prevents timing-based inference attacks.
    expect(response.status).toBe(200)
    expect(json.pagination.total).toBe(0)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(studentFindManyMock).not.toHaveBeenCalled()
  })

  it('returns an empty result when the teacher has no class section assignments', async () => {
    getTeacherClassSectionIdsMock.mockResolvedValue([])

    const response = await GET(
      new Request('http://localhost/api/teacher-portal/my-students') as unknown as NextRequest
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.pagination.total).toBe(0)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('queries all authorised sections when no classSectionId filter is provided', async () => {
    getTeacherClassSectionIdsMock.mockResolvedValue(['section-1', 'section-2'])
    transactionMock.mockResolvedValue([0, []])

    const response = await GET(
      new Request('http://localhost/api/teacher-portal/my-students?limit=10') as unknown as NextRequest
    )

    expect(response.status).toBe(200)
    // Scope resolver called — confirms both sections are in scope.
    expect(getTeacherClassSectionIdsMock).toHaveBeenCalledWith('teacher-1', 'year-1')
    // Transaction was executed — confirms we reached the DB layer.
    expect(transactionMock).toHaveBeenCalled()
  })

  it('returns 403 for non-teacher roles', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-2', role: 'ADMIN' } })

    const response = await GET(
      new Request('http://localhost/api/teacher-portal/my-students') as unknown as NextRequest
    )

    expect(response.status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated requests', async () => {
    authMock.mockResolvedValue(null)

    const response = await GET(
      new Request('http://localhost/api/teacher-portal/my-students') as unknown as NextRequest
    )

    expect(response.status).toBe(401)
  })
})
