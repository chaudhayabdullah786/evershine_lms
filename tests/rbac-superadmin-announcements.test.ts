import { describe, expect, it } from 'vitest'
import { checkPermission, getAllowedActions } from '@/lib/rbac'

describe('SuperAdmin announcement permissions', () => {
  it('allows SuperAdmin to publish, edit, and remove announcements', () => {
    expect(getAllowedActions('SUPER_ADMIN', 'announcements')).toEqual(
      expect.arrayContaining(['create', 'read', 'update', 'delete'])
    )
    expect(checkPermission('SUPER_ADMIN', 'announcements', 'create')).toBe(true)
    expect(checkPermission('SUPER_ADMIN', 'announcements', 'update')).toBe(true)
    expect(checkPermission('SUPER_ADMIN', 'announcements', 'delete')).toBe(true)
  })

  it('keeps students read-only for announcements', () => {
    expect(checkPermission('STUDENT', 'announcements', 'read')).toBe(true)
    expect(checkPermission('STUDENT', 'announcements', 'create')).toBe(false)
    expect(checkPermission('STUDENT', 'announcements', 'update')).toBe(false)
    expect(checkPermission('STUDENT', 'announcements', 'delete')).toBe(false)
  })
})
