import { describe, it, expect, afterEach, vi } from 'vitest'
import { guardLegacyClassMutation } from '@/lib/academic/legacy-guard'
import { createTimetableSlotSchema, publishTimetableSchema } from '@/lib/validation/academic'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('timetable admin flow guards', () => {
  it('allows modern admin timetable mutations when academic engine is primary', () => {
    vi.stubEnv('LEGACY_API_ENABLED', 'false')
    vi.stubEnv('NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY', 'true')

    const request = { headers: new Headers() } as any

    const result = guardLegacyClassMutation(request, 'timetable', 'ADMIN')

    expect(result).toBeNull()
  })

  it('still blocks legacy admin timetable mutations when academic engine is primary', () => {
    vi.stubEnv('LEGACY_API_ENABLED', 'false')
    vi.stubEnv('NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY', 'true')

    const request = { headers: new Headers({ 'x-legacy-academic-client': '1' }) } as any

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

  it('accepts non-cuid id formats for publish requests', () => {
    const parsed = publishTimetableSchema.safeParse({
      academicYearId: 'year-123',
      classSectionId: 'section-456',
    })

    expect(parsed.success).toBe(true)
  })
})
