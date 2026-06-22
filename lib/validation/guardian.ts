/**
 * Guardian Module — Zod Validation Schemas (Phase 15)
 * Enforced at the API boundary; never trust client-supplied data.
 */

import { z } from 'zod'

// ─── Attendance query ─────────────────────────────────────────────────────────

export const guardianAttendanceQuerySchema = z.object({
  /** ISO month string: "2026-05". Defaults to current month if omitted. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM')
    .optional(),
})

// ─── Fee query ────────────────────────────────────────────────────────────────

export const guardianFeeQuerySchema = z.object({
  academicYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, 'academicYear must be YYYY-YYYY')
    .optional(),
})

// ─── Payment proof upload ─────────────────────────────────────────────────────

export const proofUploadSchema = z.object({
  /**
   * Guardian's deposit comment / reference.
   * Required so the accountant understands the context of the proof.
   */
  remarks: z.string().min(5, 'Please provide at least a brief description').max(500),
})

export type ProofUploadInput = z.infer<typeof proofUploadSchema>

// ─── Notification query ───────────────────────────────────────────────────────

export const guardianNotificationQuerySchema = z.object({
  limit:  z.coerce.number().min(1).max(50).default(20),
  cursor: z.string().cuid().optional(),
})

// ─── Announcement query ───────────────────────────────────────────────────────

export const guardianAnnouncementQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
})
