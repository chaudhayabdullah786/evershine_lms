import { describe, expect, it } from 'vitest'
import {
  appendTeacherStudentClassScope,
  getClassOptionLabel,
  getStudentClassLabel,
  getStudentRollNumber,
} from '@/app/dashboard/teacher/students/page'

describe('teacher students page helpers', () => {
  const currentClass = {
    id: 'legacy-class-1',
    name: 'Class 11 - A - Morning Shift',
    section: 'A',
    classSectionId: 'section-11-a',
    legacyClassId: 'legacy-class-1',
    batchId: 'batch-1',
    campusId: 'campus-1',
  }

  it('uses the current ClassSection ID when filtering a mapped class', () => {
    const params = new URLSearchParams()

    appendTeacherStudentClassScope(params, currentClass.id, [currentClass])

    expect(params.get('classSectionId')).toBe('section-11-a')
    expect(params.has('classId')).toBe(false)
  })

  it('falls back to the legacy class ID when no section mapping exists', () => {
    const params = new URLSearchParams()
    const legacyClass = { ...currentClass, classSectionId: null }

    appendTeacherStudentClassScope(params, legacyClass.id, [legacyClass])

    expect(params.get('classId')).toBe('legacy-class-1')
    expect(params.has('classSectionId')).toBe(false)
  })

  it('shows enrollment-backed class and roll details for migrated students', () => {
    const student = {
      class: null,
      rollNumber: 'legacy-roll',
      enrollments: [
        {
          id: 'enrollment-1',
          rollNumber: 'section-roll',
          status: 'ACTIVE',
          classSection: {
            id: 'section-11-a',
            className: 'Class 11',
            sectionName: 'A',
            shift: { name: 'Morning Shift', code: 'MORNING' },
          },
        },
      ],
    } as Parameters<typeof getStudentClassLabel>[0]

    expect(getStudentClassLabel(student)).toBe('Class 11 (A) · Morning Shift')
    expect(getStudentRollNumber(student)).toBe('section-roll')
  })

  it('does not duplicate a section suffix already present in a class name', () => {
    expect(
      getClassOptionLabel({
        ...currentClass,
        name: 'Class 10 - EVENING (A)',
      })
    ).toBe('Class 10 - EVENING (A)')
  })
})
