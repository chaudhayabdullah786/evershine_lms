import type { NextRequest } from 'next/server'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { guardLegacyClassMutation } from '@/lib/academic/legacy-guard'
import {
  createTimetableSlotSchema,
  createTimetableTemplateSchema,
  publishTimetableSchema,
  timetableTemplateBlockSchema,
} from '@/lib/validation/academic'
import { timetableConflictDetails, timetableConflictSummary } from '@/lib/academic/timetable-errors'
import { subjectOfferingUniqueWhere } from '@/lib/academic/timetable-keys'
import { isTimetableSchemaError, TIMETABLE_SCHEMA_SYNC_MESSAGE } from '@/lib/academic/timetable-schema'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('timetable admin flow guards', () => {
  it('recognizes missing timetable columns and keeps the recovery message safe', () => {
    expect(isTimetableSchemaError({ code: 'P2022', message: 'The column `TimetableSlot.slotType` does not exist.' })).toBe(true)
    expect(isTimetableSchemaError({ code: 'P2022', message: 'The column `Student.email` does not exist.' })).toBe(false)
    expect(TIMETABLE_SCHEMA_SYNC_MESSAGE).not.toContain('DATABASE_URL')
  })

  it('uses the Prisma SubjectOffering compound key in schema order', () => {
    expect(subjectOfferingUniqueWhere('year-1', 'section-1', 'subject-1')).toEqual({
      academicYearId_classSectionId_subjectId: {
        academicYearId: 'year-1',
        classSectionId: 'section-1',
        subjectId: 'subject-1',
      },
    })
  })

  it('allows modern admin timetable mutations when academic engine is primary', () => {
    vi.stubEnv('LEGACY_API_ENABLED', 'false')
    vi.stubEnv('NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY', 'true')

    const request = { headers: new Headers() } as unknown as NextRequest

    const result = guardLegacyClassMutation(request, 'timetable', 'ADMIN')

    expect(result).toBeNull()
  })

  it('still blocks legacy admin timetable mutations when academic engine is primary', () => {
    vi.stubEnv('LEGACY_API_ENABLED', 'false')
    vi.stubEnv('NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY', 'true')

    const request = { headers: new Headers({ 'x-legacy-academic-client': '1' }) } as unknown as NextRequest

    const result = guardLegacyClassMutation(request, 'timetable', 'ADMIN')

    expect(result?.status).toBe(410)
  })
})

describe('timetable slot validation', () => {
  it('accepts non-cuid id formats for slot creation', () => {
    const parsed = createTimetableSlotSchema.safeParse({
      academicYearId: 'year-123',
      classSectionId: 'section-456',
      subjectOfferingId: 'offering-789',
      teacherId: 'teacher-abc',
      roomId: 'room-xyz',
      dayOfWeek: 3,
      startTime: '09:00',
      endTime: '10:00',
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts UI-entered one-digit times and string day values', () => {
    const parsed = createTimetableSlotSchema.safeParse({
      academicYearId: 'year-123',
      classSectionId: 'section-456',
      subjectOfferingId: 'offering-789',
      teacherId: 'teacher-abc',
      roomId: 'room-xyz',
      dayOfWeek: '3',
      startTime: '9:00',
      endTime: '9:45',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.startTime).toBe('09:00')
      expect(parsed.data.endTime).toBe('09:45')
      expect(parsed.data.dayOfWeek).toBe(3)
    }
  })

  it('rejects slots where end time is not later than start time', () => {
    const parsed = createTimetableSlotSchema.safeParse({
      academicYearId: 'year-123',
      classSectionId: 'section-456',
      subjectOfferingId: 'offering-789',
      teacherId: 'teacher-abc',
      dayOfWeek: '3',
      startTime: '15:00',
      endTime: '09:45',
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.errors[0].message).toBe('End time must be later than start time.')
    }
  })

  it('formats timetable conflicts as user-readable field errors', () => {
    const conflicts = [
      {
        type: 'SHIFT' as const,
        message: 'Enter a time within Evening Shift (15:00-18:00). Use 24-hour time, for example 15:00 for 3 PM.',
      },
    ]

    expect(timetableConflictSummary(conflicts)).toContain('Shift timing issue')
    expect(timetableConflictDetails(conflicts)).toEqual([
      {
        field: 'startTime',
        message: 'Shift timing issue: Enter a time within Evening Shift (15:00-18:00). Use 24-hour time, for example 15:00 for 3 PM.',
      },
    ])
  })

  it('accepts non-cuid id formats for publish requests', () => {
    const parsed = publishTimetableSchema.safeParse({
      academicYearId: 'year-123',
      classSectionId: 'section-456',
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts teacher-less period blocks and preserves their explicit type', () => {
    const parsed = createTimetableSlotSchema.safeParse({
      academicYearId: 'year-123',
      classSectionId: 'section-456',
      subjectOfferingId: 'break-offering',
      teacherId: null,
      slotType: 'BREAK',
      dayOfWeek: 1,
      startTime: '10:30',
      endTime: '10:45',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.slotType).toBe('BREAK')
  })

  it('requires a subject code only for subject template blocks', () => {
    expect(
      timetableTemplateBlockSchema.safeParse({
        slotType: 'SUBJECT',
        days: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '09:45',
      }).success
    ).toBe(false)

    expect(
      timetableTemplateBlockSchema.safeParse({
        slotType: 'BREAK',
        subjectCode: 'BIO',
        days: [1, 2, 3, 4, 5],
        startTime: '10:30',
        endTime: '10:45',
      }).success
    ).toBe(false)
  })

  it('validates a complete weekly timetable template', () => {
    const parsed = createTimetableTemplateSchema.safeParse({
      academicYearId: 'year-123',
      name: 'Morning standard week',
      blocks: [
        {
          slotType: 'SUBJECT',
          subjectCode: 'BIO',
          days: [1, 2, 3, 4, 5],
          startTime: '09:00',
          endTime: '09:45',
        },
        {
          slotType: 'PRAYER',
          days: [1, 2, 3, 4, 5],
          startTime: '12:30',
          endTime: '12:45',
        },
      ],
    })

    expect(parsed.success).toBe(true)
  })
})
