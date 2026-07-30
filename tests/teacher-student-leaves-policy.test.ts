import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))

import { PATCH } from '@/app/api/teacher-portal/student-leaves/[id]/route'

describe('teacher student leave policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks teacher approval and rejection because leave decisions belong to Admin/Super Admin', async () => {
    authMock.mockResolvedValue({ user: { id: 'teacher-user-1', role: 'TEACHER' } })

    const response = await PATCH(
      new Request('http://localhost/api/teacher-portal/student-leaves/leave-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'APPROVED', remarks: 'Approved by teacher' }),
      }) as never,
      { params: Promise.resolve({ id: 'leave-1' }) }
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.success).toBe(false)
    expect(json.error.message).toContain('Admin and Super Admin')
  })
})
