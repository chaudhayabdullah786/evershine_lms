import { describe, expect, it } from 'vitest'
import { derivePerformanceBatch } from '@/lib/academic/result-utils'

describe('monitoring performance groups', () => {
  it.each([
    [90, 'Ever Shine Group'],
    [89.99, 'Quaid Group'],
    [80, 'Quaid Group'],
    [79.99, 'Iqbal Group'],
    [60, 'Iqbal Group'],
    [59.99, 'Improvement Group'],
    [0, 'Improvement Group'],
  ])('maps %s%% to %s', (percentage, expected) => {
    expect(derivePerformanceBatch(percentage)).toBe(expected)
  })
})
