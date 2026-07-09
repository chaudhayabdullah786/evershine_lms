import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    notification: {
      findMany: vi.fn(),
    },
  }
  return { mockAuth, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET } from '../app/api/notifications/counts/route'

describe('GET /api/notifications/counts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'TEACHER' } })
    mockPrisma.notification.findMany.mockResolvedValue([])
  })

  it('requires an authenticated user', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(mockPrisma.notification.findMany).not.toHaveBeenCalled()
  })

  it('returns true unread total and module counts for the current user only', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      { type: 'RESULT_PUBLISHED' },
      { type: 'DAILY_SCORE_POSTED' },
      { type: 'TARGET_ASSIGNED' },
      { type: 'PROOF_RECEIVED' },
      { type: 'FEE_UPDATE' },
      { type: 'TIMETABLE_REQUEST' },
      { type: 'GENERAL' },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      select: { type: true },
    })

    const json = await response.json()
    expect(json.data).toEqual({
      total: 7,
      modules: {
        results: 1,
        'daily-scores': 1,
        targets: 1,
        fees: 2,
        timetable: 1,
      },
    })
  })

  it('maps admissions, leads, staff, leaves, complaints, and announcements to sidebar badges', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      { type: 'ADMISSION_APPROVED' },
      { type: 'ADMISSION_DECLINED' },
      { type: 'LEAD_SUBMITTED' },
      { type: 'STAFF_APP_SUBMITTED' },
      { type: 'LEAVE_SUBMITTED' },
      { type: 'COMPLAINT_SUBMITTED' },
      { type: 'ANNOUNCEMENT' },
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual({
      total: 7,
      modules: {
        admissions: 2,
        leads: 1,
        staff: 1,
        leaves: 1,
        complaints: 1,
        announcements: 1,
      },
    })
  })
})
