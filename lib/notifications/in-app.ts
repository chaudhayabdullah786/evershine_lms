/**
 * In-App Notification Dispatcher (Phase 15)
 *
 * WHY fire-and-forget: Notification failures must never block the primary
 * financial transaction (fee recording, proof approval). We log errors but
 * always resolve successfully from the caller's perspective.
 *
 * TRADEOFF: At-most-once delivery. If the process crashes between the primary
 * $transaction commit and this dispatch, the notification is lost. Acceptable
 * for this use case — no financial data is at risk.
 *
 * EMAIL STUB: Resend integration is wired but gated behind
 * ENABLE_EMAIL_NOTIFICATIONS=true. Default is false (local dev + testing).
 * Enable when deploying to production hosting.
 */

import { prisma } from '@/lib/prisma'

// ─── Typed event union ────────────────────────────────────────────────────────

export type NotificationEvent =
  | { type: 'FEE_INVOICE_GENERATED'; invoiceId: string; studentId: string }
  | { type: 'FEE_OVERDUE';           invoiceId: string; studentId: string }
  | { type: 'PROOF_RECEIVED';        invoiceId: string; accountantUserId: string }
  | { type: 'PROOF_APPROVED';        invoiceId: string; studentId: string }
  | { type: 'PROOF_REJECTED';        invoiceId: string; studentId: string; reason: string }
  | { type: 'RESULT_PUBLISHED';      resultId: string;  studentId: string }
  | { type: 'BIRTHDAY';              studentId: string }
  | { type: 'ANNOUNCEMENT';          announcementId: string; targetRole?: string }

// ─── Human-readable message builders ─────────────────────────────────────────

function buildMessage(event: NotificationEvent): { title: string; body: string } {
  switch (event.type) {
    case 'FEE_INVOICE_GENERATED':
      return { title: 'New Fee Invoice', body: 'A new fee invoice has been generated for your child.' }
    case 'FEE_OVERDUE':
      return { title: 'Fee Overdue', body: 'A fee payment is overdue for your child. Please clear the outstanding balance.' }
    case 'PROOF_RECEIVED':
      return { title: 'Payment Proof Received', body: 'A guardian has submitted a payment proof for review.' }
    case 'PROOF_APPROVED':
      return { title: 'Payment Approved', body: 'Your submitted payment proof has been approved. Thank you!' }
    case 'PROOF_REJECTED':
      return { title: 'Payment Proof Rejected', body: `Your payment proof was rejected. Reason: ${event.reason}` }
    case 'RESULT_PUBLISHED':
      return { title: 'Result Published', body: "Your child's exam result is now available." }
    case 'BIRTHDAY':
      return { title: '🎂 Birthday Today', body: "Wishing your child a very happy birthday from Evershaheen Academy!" }
    case 'ANNOUNCEMENT':
      return { title: 'New Announcement', body: 'There is a new announcement from Evershaheen Academy.' }
  }
}

// ─── Recipient resolver ───────────────────────────────────────────────────────

async function resolveRecipientUserIds(event: NotificationEvent): Promise<string[]> {
  switch (event.type) {
    case 'FEE_INVOICE_GENERATED':
    case 'FEE_OVERDUE':
    case 'RESULT_PUBLISHED':
    case 'BIRTHDAY': {
      // All guardians linked to the student
      const student = await prisma.student.findUnique({
        where: { id: event.studentId },
        select: { guardians: { select: { userId: true } } },
      })
      return student?.guardians.map((g) => g.userId) ?? []
    }

    case 'PROOF_APPROVED':
    case 'PROOF_REJECTED': {
      // Notify both the student AND all their guardians
      const student = await prisma.student.findUnique({
        where: { id: event.studentId },
        select: {
          userId: true,
          guardians: { select: { userId: true } },
        },
      })
      if (!student) return []
      const guardianIds = student.guardians.map((g) => g.userId)
      // Include student's own userId; dedupe in case of overlap
      return [...new Set([student.userId, ...guardianIds])]
    }

    case 'PROOF_RECEIVED':
      // The specific accountant who needs to review it
      return [event.accountantUserId]

    case 'ANNOUNCEMENT': {
      if (!event.targetRole || event.targetRole === 'GUARDIAN') {
        const guardians = await prisma.guardian.findMany({
          where: { isActive: true },
          select: { userId: true },
        })
        return guardians.map((g) => g.userId)
      }
      return []
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Dispatches an in-app notification. Non-blocking — never throws to caller.
 * Resolves immediately after enqueueing the DB write.
 *
 * @param event - Typed notification event
 */
export function dispatchNotification(event: NotificationEvent): void {
  // Intentionally NOT awaited — fire and forget
  void _dispatch(event).catch((err) => {
    // Log but never propagate — notification failure must not affect caller
    console.error('[dispatchNotification] Failed to dispatch:', event.type, err)
  })
}

async function _dispatch(event: NotificationEvent): Promise<void> {
  const { title, body } = buildMessage(event)
  const recipientIds = await resolveRecipientUserIds(event)

  if (recipientIds.length === 0) return

  // Bulk-create in-app Notification rows
  await prisma.notification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      title,
      message: body,
      type: event.type,
      isRead: false,
    })),
    skipDuplicates: true,
  })

  // Email stub — wired but disabled by default
  if (process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true') {
    // TODO(Phase 15 — hosting): Wire Resend here.
    // Import { Resend } from 'resend' and call resend.emails.send(...)
    // for each recipient who has a non-null email address.
    console.info('[dispatchNotification] Email delivery: STUB (not yet wired)')
  }
}
