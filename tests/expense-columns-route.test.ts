import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    $queryRaw: vi.fn(),
  }
  return { mockAuth, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET } from '../app/api/accountant/expenses/columns/route'

describe('GET /api/accountant/expenses/columns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } })
    mockPrisma.$queryRaw.mockResolvedValue([
      { column_name: 'paymentsource' },
      { column_name: 'paymentreference' },
    ])
  })

  it('reports payment metadata support from the current MySQL database schema', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data).toEqual({ paymentSource: true, paymentReference: true })
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1)
  })
})
