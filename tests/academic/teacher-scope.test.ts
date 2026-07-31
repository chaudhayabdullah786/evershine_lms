import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  subjectOfferingFindMany,
  timetableSlotFindMany,
  classTeacherFindMany,
  subjectTeacherFindMany,
  classTaskFindMany,
  termResultFindMany,
  classFindMany,
  classSectionFindMany,
  studentEnrollmentFindMany,
} = vi.hoisted(() => ({
  subjectOfferingFindMany: vi.fn(),
  timetableSlotFindMany: vi.fn(),
  classTeacherFindMany: vi.fn(),
  subjectTeacherFindMany: vi.fn(),
  classTaskFindMany: vi.fn(),
  termResultFindMany: vi.fn(),
  classFindMany: vi.fn(),
  classSectionFindMany: vi.fn(),
  studentEnrollmentFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subjectOffering: { findMany: subjectOfferingFindMany },
    timetableSlot: { findMany: timetableSlotFindMany },
    classTeacher: { findMany: classTeacherFindMany },
    subjectTeacher: { findMany: subjectTeacherFindMany },
    classTask: { findMany: classTaskFindMany },
    termResult: { findMany: termResultFindMany },
    class: { findMany: classFindMany },
    classSection: { findMany: classSectionFindMany },
    studentEnrollment: { findMany: studentEnrollmentFindMany },
  },
}))

vi.mock('@/lib/academic/engine', () => ({
  getActiveAcademicYear: vi.fn(async () => ({ id: 'year-1', name: '2024-2025' })),
}))

import { getTeacherClassSectionIds } from '@/lib/academic/teacher-scope'

describe('teacher section resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subjectOfferingFindMany.mockResolvedValue([])
    timetableSlotFindMany.mockResolvedValue([])
    classTeacherFindMany.mockResolvedValue([])
    subjectTeacherFindMany.mockResolvedValue([])
    classTaskFindMany.mockResolvedValue([])
    termResultFindMany.mockResolvedValue([])
    classFindMany.mockResolvedValue([])
    classSectionFindMany.mockResolvedValue([])
    studentEnrollmentFindMany.mockResolvedValue([])
  })

  it('includes published timetable slots as valid teacher section assignments', async () => {
    timetableSlotFindMany.mockResolvedValue([
      { classSectionId: 'sec-a' },
      { classSectionId: 'sec-b' },
      { classSectionId: 'sec-a' },
    ])

    const result = await getTeacherClassSectionIds('teacher-1')

    expect(result).toEqual(['sec-a', 'sec-b'])
    expect(timetableSlotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: 'teacher-1',
          academicYearId: 'year-1',
        }),
        select: { classSectionId: true },
      })
    )
  })

  it('maps legacy class teacher assignments to the active class sections using the academic year label', async () => {
    classTeacherFindMany.mockResolvedValue([{ classId: 'legacy-class-1' }])
    classFindMany.mockResolvedValue([
      { id: 'legacy-class-1', name: 'Class 12', grade: 12, section: 'A', campusId: 'campus-1', batchId: 'batch-1', shift: 'MORNING' },
    ])
    classSectionFindMany.mockResolvedValue([
      { id: 'section-12a', className: 'Class 12', sectionName: 'A', grade: 12, campusId: 'campus-1', batchId: 'batch-1', shift: { code: 'MORNING' } },
    ])

    const result = await getTeacherClassSectionIds('teacher-1')

    expect(result).toEqual(['section-12a'])
    expect(classTeacherFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: 'teacher-1',
          OR: expect.arrayContaining([
            expect.objectContaining({ academicYear: '2024-2025' }),
            expect.objectContaining({ academicYear: 'year-1' }),
          ]),
        }),
      })
    )
  })

  it('maps legacy classes to current sections when production batch ids drift between engines', async () => {
    classTeacherFindMany
      .mockResolvedValueOnce([{ classId: 'legacy-class-1' }])
      .mockResolvedValueOnce([{ classId: 'legacy-class-1' }])
    classFindMany.mockResolvedValue([
      { id: 'legacy-class-1', name: 'Class 11 - A', grade: 11, section: 'A', campusId: 'campus-1', batchId: 'legacy-batch', shift: 'MORNING' },
    ])
    classSectionFindMany.mockResolvedValue([
      { id: 'section-11a-current', className: 'Class 11', sectionName: 'A', grade: 11, campusId: 'campus-1', batchId: 'current-batch', shift: { code: 'MORNING_SHIFT' } },
    ])

    const result = await getTeacherClassSectionIds('teacher-1')

    expect(result).toEqual(['section-11a-current'])
  })

  it('keeps an inactive migrated legacy class in scope when it is assigned for the active year', async () => {
    classTeacherFindMany
      .mockResolvedValueOnce([{ classId: 'legacy-class-current' }])
      .mockResolvedValueOnce([{ classId: 'legacy-class-current' }])
    classFindMany.mockResolvedValue([
      {
        id: 'legacy-class-current',
        name: 'Class 10 - Jun',
        grade: 10,
        section: 'Jun',
        campusId: 'campus-1',
        batchId: 'legacy-batch',
        shift: 'MORNING',
        isActive: false,
      },
    ])
    classSectionFindMany.mockResolvedValue([
      {
        id: 'section-10-jun',
        className: 'Class 10',
        sectionName: 'Jun',
        grade: 10,
        campusId: 'campus-1',
        batchId: 'current-batch',
        shift: { code: 'MORNING_SHIFT' },
      },
    ])

    const result = await getTeacherClassSectionIds('teacher-1')

    expect(result).toEqual(['section-10-jun'])
    expect(classFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['legacy-class-current'] },
        OR: expect.arrayContaining([
          { isActive: true },
          { id: { in: ['legacy-class-current'] } },
        ]),
      }),
    }))
  })

  it('maps legacy assignments by stable identifiers when display names differ between engines', async () => {
    classTeacherFindMany
      .mockResolvedValueOnce([{ classId: 'legacy-class-1' }])
      .mockResolvedValueOnce([{ classId: 'legacy-class-1' }])
    classFindMany.mockResolvedValue([
      {
        id: 'legacy-class-1',
        name: 'XI-A Morning Cohort',
        grade: 11,
        section: 'A',
        campusId: 'campus-1',
        batchId: 'legacy-batch',
        shift: 'MORNING',
      },
    ])
    classSectionFindMany.mockResolvedValue([
      {
        id: 'section-11a-current',
        className: 'Senior Secondary',
        sectionName: 'A',
        grade: 11,
        campusId: 'campus-1',
        batchId: 'current-batch',
        shift: { code: 'MORNING_SHIFT' },
      },
    ])

    const result = await getTeacherClassSectionIds('teacher-1')

    expect(result).toEqual(['section-11a-current'])
  })

  it('does not grant an ambiguous legacy assignment to multiple sections', async () => {
    classTeacherFindMany
      .mockResolvedValueOnce([{ classId: 'legacy-class-1' }])
      .mockResolvedValueOnce([{ classId: 'legacy-class-1' }])
    classFindMany.mockResolvedValue([
      {
        id: 'legacy-class-1',
        name: 'XI-A',
        grade: 11,
        section: 'A',
        campusId: 'campus-1',
        batchId: 'legacy-batch',
        shift: 'MORNING',
      },
    ])
    classSectionFindMany.mockResolvedValue([
      {
        id: 'section-11a-one',
        className: 'Senior Secondary East',
        sectionName: 'A',
        grade: 11,
        campusId: 'campus-1',
        batchId: 'batch-1',
        shift: { code: 'EVENING' },
      },
      {
        id: 'section-11a-two',
        className: 'Senior Secondary West',
        sectionName: 'A',
        grade: 11,
        campusId: 'campus-1',
        batchId: 'batch-2',
        shift: { code: 'NIGHT' },
      },
    ])

    const result = await getTeacherClassSectionIds('teacher-1')

    expect(result).toEqual([])
  })

  it('keeps sections with teacher-owned draft results visible for declaration', async () => {
    termResultFindMany.mockResolvedValue([{ classSectionId: 'section-from-draft' }])

    const result = await getTeacherClassSectionIds('teacher-1')

    expect(result).toEqual(['section-from-draft'])
  })
})
