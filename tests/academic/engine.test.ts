import { describe, it, expect } from 'vitest'
import {
  timeToMinutes,
  timesOverlap,
  isWithinShiftWindow,
  validateGradingWeights,
  calculateWeightedPercentage,
  calculatePenaltyAmount,
} from '@/lib/academic/engine'

describe('academic engine utilities', () => {
  it('timeToMinutes parses HH:mm', () => {
    expect(timeToMinutes('09:00')).toBe(540)
    expect(timeToMinutes('21:00')).toBe(1260)
  })

  it('timesOverlap detects overlapping intervals', () => {
    expect(timesOverlap('09:00', '10:00', '09:30', '10:30')).toBe(true)
    expect(timesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false)
  })

  it('isWithinShiftWindow respects explicit bounds', () => {
    // Morning shift: 09:00–12:00
    expect(isWithinShiftWindow('09:00', '12:00', '09:00', '12:00')).toBe(true)
    expect(isWithinShiftWindow('08:00', '12:00', '09:00', '12:00')).toBe(false)
    // Night shift: 18:00–21:00
    expect(isWithinShiftWindow('18:00', '21:00', '18:00', '21:00')).toBe(true)
    expect(isWithinShiftWindow('17:00', '20:00', '18:00', '21:00')).toBe(false)
  })

  it('validateGradingWeights requires 100%', () => {
    expect(validateGradingWeights([{ weightPercentage: 50 }, { weightPercentage: 50 }]).valid).toBe(true)
    expect(validateGradingWeights([{ weightPercentage: 40 }, { weightPercentage: 50 }]).valid).toBe(false)
  })

  it('calculateWeightedPercentage applies component weights', () => {
    const pct = calculateWeightedPercentage([
      { maxMarks: 100, weightPercentage: 50, obtained: 80 },
      { maxMarks: 100, weightPercentage: 50, obtained: 60 },
    ])
    expect(pct).toBe(70)
  })

  it('calculatePenaltyAmount fixed and capped', () => {
    expect(calculatePenaltyAmount('FIXED', 500, 10000)).toBe(500)
    expect(calculatePenaltyAmount('PERCENTAGE', 10, 1000)).toBe(100)
    expect(calculatePenaltyAmount('PERCENTAGE', 50, 1000, 200)).toBe(200)
  })
})
