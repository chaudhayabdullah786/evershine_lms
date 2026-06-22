import { describe, it, expect } from 'vitest'
import { parseLegacyClassLabels } from '@/lib/academic/legacy-migrate'

describe('parseLegacyClassLabels', () => {
  it('uses grade from name when present', () => {
    expect(
      parseLegacyClassLabels({ name: 'Class 9-A Morning', grade: 9, section: 'A' })
    ).toEqual({ className: 'Class 9', sectionName: 'A' })
  })

  it('falls back to grade field', () => {
    expect(parseLegacyClassLabels({ name: 'Section B', grade: 10, section: null })).toEqual({
      className: 'Class 10',
      sectionName: 'A',
    })
  })
})
