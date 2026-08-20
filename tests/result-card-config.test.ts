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
    expect(toNumericMark({ value: '91.25' })).toBe(91.25)
    expect(toNumericMark({ toNumber: () => 88.5 })).toBe(88.5)
    expect(toNumericMark(null)).toBeNull()
    expect([toNumericMark('87'), toNumericMark('76')].reduce((sum, mark) => sum + (mark ?? 0), 0)).toBe(163)
  })

  it('keeps human labels but never prints opaque legacy session IDs', () => {
    expect(formatExamSessionLabel('second-step_exam')).toBe('Second Step Exam')
    expect(formatExamSessionLabel('cmSKLM7QW0ETQA9QWB1098S6')).toBe('Official Result Card')
    expect(formatExamSessionLabel('')).toBe('Official Result Card')
  })
})
