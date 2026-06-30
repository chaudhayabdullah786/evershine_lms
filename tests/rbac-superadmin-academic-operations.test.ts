import { describe, expect, it } from 'vitest'
import { checkPermission, getAllowedActions } from '@/lib/rbac'

describe('SuperAdmin academic operation permissions', () => {
  it('allows SuperAdmin to schedule, edit, and remove exams', () => {
    expect(getAllowedActions('SUPER_ADMIN', 'exams')).toEqual(
      expect.arrayContaining(['create', 'read', 'update', 'delete'])
    )
    expect(checkPermission('SUPER_ADMIN', 'exams', 'create')).toBe(true)
    expect(checkPermission('SUPER_ADMIN', 'exams', 'update')).toBe(true)
    expect(checkPermission('SUPER_ADMIN', 'exams', 'delete')).toBe(true)
  })

  it('allows SuperAdmin to manage Academic Engine grading configuration', () => {
    expect(getAllowedActions('SUPER_ADMIN', 'grading_engine')).toEqual(
      expect.arrayContaining(['create', 'read', 'update', 'delete'])
    )
    expect(checkPermission('SUPER_ADMIN', 'grading_engine', 'create')).toBe(true)
    expect(checkPermission('SUPER_ADMIN', 'grading_engine', 'update')).toBe(true)
    expect(checkPermission('SUPER_ADMIN', 'grading_engine', 'delete')).toBe(true)
  })

  it('keeps SuperAdmin result mutations view-only under the current policy', () => {
    expect(getAllowedActions('SUPER_ADMIN', 'results')).toEqual(['read'])
    expect(checkPermission('SUPER_ADMIN', 'results', 'create')).toBe(false)
    expect(checkPermission('SUPER_ADMIN', 'results', 'update')).toBe(false)
    expect(checkPermission('SUPER_ADMIN', 'results', 'delete')).toBe(false)
  })
})
