import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESULT_CARD_CONFIG,
  formatExamSessionLabel,
  getDisplayedPosition,
  parseResultCardConfig,
  toNumericMark,
} from '@/lib/academic/result-card-config'

describe('result card display configuration', () => {
  it('defaults to a clean card without an unapproved class position', () => {
    const config = parseResultCardConfig(null)
    expect(config).toEqual(DEFAULT_RESULT_CARD_CONFIG)
    expect(getDisplayedPosition(config, 1, 4)).toBeNull()
  })

  it('uses the selected source for approved or manual positions', () => {
    expect(getDisplayedPosition({ showClassPosition: true, positionMode: 'SYSTEM_APPROVED' }, 2, 9)).toBe(2)
    expect(getDisplayedPosition({ showClassPosition: true, positionMode: 'MANUAL' }, 2, 9)).toBe(9)
    expect(getDisplayedPosition({ showClassPosition: false, positionMode: 'MANUAL' }, 2, 9)).toBeNull()
  })

  it('normalizes decimal marks without string concatenation', () => {
    expect(toNumericMark('87.5')).toBe(87.5)
    expect(toNumericMark(100)).toBe(100)
    expect(toNumericMark(null)).toBeNull()
    expect([toNumericMark('87'), toNumericMark('76')].reduce((sum, mark) => sum + (mark ?? 0), 0)).toBe(163)
  })

  it('formats opaque legacy session IDs only as a fallback label', () => {
    expect(formatExamSessionLabel('second-step_exam')).toBe('Second Step Exam')
    expect(formatExamSessionLabel('')).toBe('Official Result Card')
  })
})
