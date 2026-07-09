import { describe, expect, it } from 'vitest'
import {
  dailyGradeScore,
  decodeMonitoringRemarks,
  encodeMonitoringRemarks,
  derivePerformanceGroup,
} from '@/lib/academic/monitoring'

describe('monitoring metadata helpers', () => {
  it('encodes and decodes qualitative daily report metadata without losing remarks', () => {
    const encoded = encodeMonitoringRemarks({
      grade: 'EXCELLENT',
      remarks: 'Focused and confident today',
      isStarOfDay: true,
      isConcern: false,
    })

    expect(decodeMonitoringRemarks(encoded, 20, 20)).toEqual({
      grade: 'EXCELLENT',
      remarks: 'Focused and confident today',
      isStarOfDay: true,
      isConcern: false,
    })
  })

  it('keeps legacy plain remarks readable and derives concern from poor score', () => {
    expect(decodeMonitoringRemarks('Needs writing practice', 4, 20)).toMatchObject({
      grade: 'POOR',
      remarks: 'Needs writing practice',
      isConcern: true,
    })
  })

  it('maps daily qualitative grades to the configured subject score scale', () => {
    expect(dailyGradeScore('EXCELLENT', 25)).toBe(25)
    expect(dailyGradeScore('GOOD', 25)).toBe(20)
    expect(dailyGradeScore('NORMAL', 25)).toBe(15)
    expect(dailyGradeScore('POOR', 25)).toBe(8.75)
  })

  it('matches the monthly monitoring status criteria requested by the school', () => {
    expect(derivePerformanceGroup(91)).toBe('Ever Shine')
    expect(derivePerformanceGroup(84)).toBe('Quaid')
    expect(derivePerformanceGroup(65)).toBe('Iqbal')
    expect(derivePerformanceGroup(59)).toBe('Improvement')
  })
})
