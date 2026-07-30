import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma, mockTx, mockSendEmail } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockSendEmail = vi.fn()
  const mockTx = {
    announcement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const mockPrisma = {
    user: { findMany: vi.fn() },
    announcement: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>> | ((tx: typeof mockTx) => Promise<unknown>)) => {
      if (Array.isArray(ops)) return Promise.all(ops)
      return ops(mockTx)
    }),
  }

  return { mockAuth, mockPrisma, mockTx, mockSendEmail }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
vi.mock('@/lib/email', () => ({ sendEmail: mockSendEmail }))

import { POST } from '../app/api/announcements/route'

const validPayload = {
  title: 'Fee Consultation',
  content: 'Submit the fee on time please',
  targetRole: null,
  expiresAt: '2026-07-30',
}

describe('POST /api/announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'Super Admin' } })
    mockTx.announcement.create.mockResolvedValue({ id: 'announcement-1', title: validPayload.title })
    mockTx.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mockPrisma.user.findMany.mockResolvedValue([])
    mockSendEmail.mockResolvedValue(undefined)
  })

  it('allows SuperAdmin sessions with display role aliases to publish announcements', async () => {
    const response = await POST(new NextRequest('http://localhost/api/announcements', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(mockTx.announcement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: validPayload.title,
        content: validPayload.content,
        targetRole: null,
        createdBy: 'admin-1',
      }),
    }))
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'admin-1',
        entityType: 'Announcement',
      }),
    }))
  })

  it('still rejects student sessions from publishing announcements', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } })

    const response = await POST(new NextRequest('http://localhost/api/announcements', {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(403)
    expect(mockTx.announcement.create).not.toHaveBeenCalled()
  })
})
