import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    teacher: { findUnique: vi.fn() },
    class: { findUnique: vi.fn(), upsert: vi.fn() },
    classSection: { findUnique: vi.fn() },
    subjectOffering: { findFirst: vi.fn() },
    subjectTeacher: { findFirst: vi.fn() },
    academicSubject: { findUnique: vi.fn() },
    subject: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    classTeacher: { findFirst: vi.fn() },
    classTask: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  }
  return { mockAuth, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: vi.fn() }))

import { POST } from '../app/api/teacher-portal/tasks/route'

describe('POST /api/teacher-portal/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-teacher-1', role: 'TEACHER' } })
    mockPrisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' })
    mockPrisma.subjectOffering.findFirst.mockResolvedValue(null)
    mockPrisma.subjectTeacher.findFirst.mockResolvedValue(null)
    mockPrisma.academicSubject.findUnique.mockResolvedValue(null)
    mockPrisma.subject.findUnique.mockResolvedValue(null)
    mockPrisma.subject.findFirst.mockResolvedValue(null)
    mockPrisma.classTeacher.findFirst.mockResolvedValue(null)
  })

  it('rejects task creation when the subject is not assigned to the teacher', async () => {
    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Chapter 3 Quiz',
        description: 'Practice quiz',
        type: 'QUIZ',
        maxMarks: 100,
        classId: 'legacy-class-1',
        legacyClassId: 'legacy-class-1',
        classSectionId: null,
        subjectId: 'unassigned-subject-1',
      }),
      headers: { 'content-type': 'application/json' },
    }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error.message).toBe('You are not authorized to create tasks for this class/subject')
    expect(mockPrisma.classTask.create).not.toHaveBeenCalled()
  })

  it('creates a task for an assigned academic subject offering after resolving the legacy subject', async () => {
    mockPrisma.subjectOffering.findFirst.mockResolvedValue({ id: 'offering-1' })
    mockPrisma.subject.findUnique.mockResolvedValue(null)
    mockPrisma.academicSubject.findUnique.mockResolvedValue({ code: 'PHY', name: 'Physics' })
    mockPrisma.subject.findFirst.mockResolvedValue({ id: 'legacy-subject-1', name: 'Physics', code: 'PHY', classId: 'legacy-class-1' })
    mockPrisma.classTask.create.mockResolvedValue({ id: 'task-1', title: 'Chapter 3 Quiz' })

    const response = await POST(new NextRequest('http://localhost/api/teacher-portal/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Chapter 3 Quiz',
        description: 'Practice quiz',
        type: 'QUIZ',
        maxMarks: 100,
        classId: 'legacy-class-1',
        legacyClassId: 'legacy-class-1',
        classSectionId: 'section-1',
        subjectId: 'academic-subject-1',
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(mockPrisma.subjectOffering.findFirst).toHaveBeenCalledWith({
      where: {
        teacherId: 'teacher-1',
        classSectionId: 'section-1',
        subjectId: 'academic-subject-1',
      },
      select: { id: true },
    })
    expect(mockPrisma.classTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classId: 'legacy-class-1',
        classSectionId: 'section-1',
        subjectId: 'legacy-subject-1',
        teacherId: 'teacher-1',
      }),
      include: {
        class: { select: { name: true, section: true } },
        classSection: { select: { id: true, className: true, sectionName: true, shift: { select: { code: true, name: true } } } },
        subject: { select: { name: true, code: true } },
      },
    })
  })
})
