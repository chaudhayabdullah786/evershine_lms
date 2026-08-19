import { describe, expect, it } from 'vitest'
import { calendarMonthBounds, isAbsencePenaltyDue, isLatePenaltyDue } from '@/lib/penalties/assessments'

describe('attendance penalty rules', () => {
  it('allows exactly the configured number of monthly absences', () => {
    expect(isAbsencePenaltyDue(3, 3)).toBe(false)
    expect(isAbsencePenaltyDue(4, 3)).toBe(true)
  })

  it('uses only minutes beyond the configured late grace period', () => {
    expect(isLatePenaltyDue(25, 25)).toBe(false)
    expect(isLatePenaltyDue(26, 25)).toBe(true)
  })

  it('builds UTC calendar-month boundaries', () => {
    const bounds = calendarMonthBounds(new Date('2026-02-14T12:00:00.000Z'))
    expect(bounds.start.toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(bounds.end.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })
})
