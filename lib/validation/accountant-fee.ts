/**
 * Accountant Fee Module — Zod Validation Schemas (Phase 15)
 */

import { z } from 'zod'

// ─── Fee invoice creation ─────────────────────────────────────────────────────

export const accountantCreateInvoiceSchema = z.object({
  studentId:    z.string().cuid('Invalid student ID'),
  /** Human-readable month label: "May 2026" */
  month:        z.string().regex(/^\w+ \d{4}$/, 'Month must be e.g. "May 2026"'),
  /** Academic year: "2025-2026" */
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, 'Academic year must be YYYY-YYYY'),
  dueDate:      z.string().datetime('Due date must be a valid ISO datetime'),
  items: z
    .array(
      z.object({
        description: z.string().min(2).max(200),
        amount:      z.number().positive().multipleOf(0.01),
      })
    )
    .min(1, 'At least one fee item is required'),
  discount: z.number().min(0).default(0),
  notes:    z.string().max(500).optional(),
})

export type AccountantCreateInvoiceInput = z.infer<typeof accountantCreateInvoiceSchema>

// ─── Invoice status update ────────────────────────────────────────────────────

export const updateInvoiceStatusSchema = z.object({
  status:   z.enum(['ISSUED', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED']),
  lateFee:  z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  notes:    z.string().max(500).optional(),
})

export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>

// ─── Record manual payment ────────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  amount:        z.number().positive('Amount must be greater than zero'),
  paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Cheque', 'Online']),
  transactionId: z.string().max(100).optional(),
  remarks:       z.string().max(500).optional(),
  /** ISO datetime string. Defaults to now() if not provided. */
  paymentDate:   z.string().datetime().optional(),
})

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>

// ─── Proof action (approve / reject) ─────────────────────────────────────────

export const proofActionSchema = z.object({
  action:     z.enum(['APPROVE', 'REJECT']),
  remarks:    z.string().max(500).optional(),
  /** Optional: exact amount student paid (for partial approval). Defaults to full remaining balance. */
  paidAmount: z.number().positive('Paid amount must be greater than zero').optional(),
})

export type ProofActionInput = z.infer<typeof proofActionSchema>

// ─── Fee export queries ───────────────────────────────────────────────────────

export const feeExportPaidSchema = z.object({
  month:        z.string().regex(/^\w+ \d{4}$/, 'Month must be e.g. "May 2026"').optional(),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  campusId:     z.string().cuid().optional(),
  classId:      z.string().cuid().optional(),
})

export const feeExportDefaultersSchema = z.object({
  academicYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  campusId:     z.string().cuid().optional(),
  classId:      z.string().cuid().optional(),
})
