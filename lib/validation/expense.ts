/**
 * Expense Module — Zod Validation Schemas (Phase 15)
 */

import { z } from 'zod'
import { ExpenseCategory } from '@prisma/client'

// ─── Create ───────────────────────────────────────────────────────────────────

export const createExpenseSchema = z.object({
  title:       z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().max(1000).optional(),
  /** Amount in PKR. Must be positive and have at most 2 decimal places. */
  amount:      z
    .number({ required_error: 'Amount is required' })
    .positive('Amount must be greater than zero')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places'),
  category:   z.nativeEnum(ExpenseCategory),
  /** ISO date string "YYYY-MM-DD" */
  date:       z.string().date('Date must be in YYYY-MM-DD format'),
  receiptUrl: z.string().url('Receipt URL must be a valid URL').optional(),
  notes:      z.string().max(500).optional(),
  /** Required if the accountant has 'All Campuses' access */
  campusId:   z.string().cuid('Campus ID is invalid').optional(),
  paymentSource: z.string().max(100).optional().nullable(),
  paymentReference: z.string().max(100).optional().nullable(),
})

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateExpenseSchema = createExpenseSchema.partial()

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>

// ─── List / filter query ──────────────────────────────────────────────────────

export const expenseQuerySchema = z.object({
  /**
   * Convenience period selector. If provided alongside explicit startDate/endDate,
   * explicit dates take precedence.
   */
  period:    z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  startDate: z.string().date().optional(),
  endDate:   z.string().date().optional(),
  category:  z.nativeEnum(ExpenseCategory).optional(),
  campusId:  z.string().cuid('Campus ID is invalid').optional(),
  page:      z.coerce.number().min(1).default(1),
  limit:     z.coerce.number().min(1).max(100).default(50),
})

export type ExpenseQueryInput = z.infer<typeof expenseQuerySchema>

// ─── Export query ─────────────────────────────────────────────────────────────

export const expenseExportSchema = z.object({
  period:    z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  startDate: z.string().date().optional(),
  endDate:   z.string().date().optional(),
  category:  z.nativeEnum(ExpenseCategory).optional(),
  campusId:  z.string().cuid('Campus ID is invalid').optional(),
})

export type ExpenseExportInput = z.infer<typeof expenseExportSchema>
