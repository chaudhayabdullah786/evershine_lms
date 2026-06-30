import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockCheckPermission, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockCheckPermission = vi.fn()
  const mockTx = {
    calendarEvent: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const mockPrisma = {
    calendarEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>> | ((tx: typeof mockTx) => Promise<unknown>)) => {
      if (Array.isArray(ops)) return Promise.all(ops)
      return ops(mockTx)
    }),
  }

  return { mockAuth, mockCheckPermission, mockPrisma, mockTx }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/rbac', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { GET, POST } from '../app/api/calendar/route'
import { PUT } from '../app/api/calendar/[id]/route'

describe('/api/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockAuth.mockResolvedValue({ user: { id: 'super-1', role: 'SUPER_ADMIN', campusId: null } })
    mockCheckPermission.mockReturnValue(true)
    mockPrisma.calendarEvent.count.mockResolvedValue(1)
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        title: 'Midyear Break',
        description: null,
        startDate: new Date('2026-06-28T09:00:00.000Z'),
        endDate: new Date('2026-07-03T17:00:00.000Z'),
        eventType: 'Holiday',
        campusId: null,
      },
    ])
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      title: 'Exam Week',
      startDate: new Date('2026-07-10T09:00:00.000Z'),
      endDate: new Date('2026-07-10T12:00:00.000Z'),
      isActive: true,
    })
    mockTx.calendarEvent.create.mockResolvedValue({ id: 'event-created' })
    mockTx.calendarEvent.update.mockResolvedValue({ id: 'event-1' })
    mockTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  it('queries events that overlap the requested date range', async () => {
    const response = await GET(new NextRequest('http://localhost/api/calendar?startDate=2026-07-01&endDate=2026-07-31&limit=100'))

    expect(response.status).toBe(200)
    expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isActive: true,
        AND: [
          { endDate: { gte: new Date('2026-07-01') } },
          { startDate: { lte: new Date('2026-07-31T23:59:59') } },
        ],
      }),
    }))
  })

  it('rejects an invalid calendar date range on create', async () => {
    const response = await POST(new NextRequest('http://localhost/api/calendar', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Invalid Event',
        description: null,
        startDate: '2026-07-10T17:00',
        endDate: '2026-07-10T09:00',
        eventType: 'Other',
        campusId: null,
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(400)
    expect(mockTx.calendarEvent.create).not.toHaveBeenCalled()
  })

  it('rejects updates that would make an event end before it starts', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/calendar/event-1', {
        method: 'PUT',
        body: JSON.stringify({ endDate: '2026-07-09T12:00' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'event-1' }) }
    )

    expect(response.status).toBe(400)
    expect(mockTx.calendarEvent.update).not.toHaveBeenCalled()
  })
})
