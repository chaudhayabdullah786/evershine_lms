import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockPrisma = {
    monthlyFeedbackCycle: { findUnique: vi.fn() },
    studentFeedbackSubmission: { findUnique: vi.fn() },
    guardian: { findUnique: vi.fn() },
    parent: { findUnique: vi.fn() },
    feedbackQuestion: { findMany: vi.fn() },
    $transaction: vi.fn(),
  }

  return { mockAuth, mockPrisma }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST } from '../app/api/guardian-portal/feedback/submit/route'

describe('guardian service feedback submit route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'guardian-user-1', role: 'GUARDIAN' } })
    mockPrisma.monthlyFeedbackCycle.findUnique.mockResolvedValue({
      id: 'clxcycle00000000000001',
      isOpen: true,
    })
    mockPrisma.studentFeedbackSubmission.findUnique.mockResolvedValue(null)
    mockPrisma.guardian.findUnique.mockResolvedValue(null)
    mockPrisma.parent.findUnique.mockResolvedValue(null)
  })

  it('does not create feedback with placeholder campus or batch IDs when no active child is linked', async () => {
    const response = await POST(new NextRequest('http://localhost/api/guardian-portal/feedback/submit', {
      method: 'POST',
      body: JSON.stringify({
        cycleId: 'clxcycle00000000000001',
        answers: [{ questionId: 'clxserviceq00000000001', response: 'AGREE' }],
      }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(403)
    expect(mockPrisma.feedbackQuestion.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
