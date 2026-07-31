import { describe, expect, it } from 'vitest'
import {
  dailyGradeScore,
  decodeMonitoringRemarks,
  encodeMonitoringRemarks,
  derivePerformanceGroup,
  toDailyMonitoringPortalEntry,
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


  it('formats portal daily monitoring entries without exposing encoded JSON metadata', () => {
    const encoded = encodeMonitoringRemarks({
      grade: 'GOOD',
      remarks: 'Physics: Keep doing focused practice',
      isStarOfDay: true,
      isConcern: false,
    })

    expect(toDailyMonitoringPortalEntry({
      rawRemarks: encoded,
      score: 16,
      maxScore: 20,
      courseName: 'Physics',
      grade: 'A',
      highlight: null,
    })).toEqual({
      remarks: 'Keep doing focused practice',
      grade: 'A',
      highlight: 'STAR_OF_THE_DAY',
    })
  })

  it('maps daily qualitative grades to the configured subject score scale', () => {
    expect(dailyGradeScore('EXCELLENT', 25)).toBe(25)
    expect(dailyGradeScore('GOOD', 25)).toBe(20)
    expect(dailyGradeScore('NORMAL', 25)).toBe(15)
    expect(dailyGradeScore('POOR', 25)).toBe(8.75)
  })

  it('matches the monthly monitoring status criteria requested by the school', () => {
    expect(derivePerformanceGroup(91)).toBe('Ever Shine Group')
    expect(derivePerformanceGroup(84)).toBe('Quaid Group')
    expect(derivePerformanceGroup(65)).toBe('Iqbal Group')
    expect(derivePerformanceGroup(59)).toBe('Improvement Group')
  })
})
