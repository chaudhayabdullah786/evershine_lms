/**
 * Fee Management Zod Schemas
 *
 * WHY strict decimal validation: Fee amounts are financial data.
 * Accepting strings allows precision loss that corrupts the ledger.
 */

import { z } from 'zod'

// Individual line item on a challan
const feeItemSchema = z.object({
  description: z.string().min(2, 'Fee description is required').trim(),
  amount: z
    .number({ invalid_type_error: 'Amount must be a number' })
    .positive('Amount must be positive')
    .refine((val) => Math.round(val * 100) / 100 === val, 'Amount cannot have more than 2 decimal places'),
})

export const generateChallanSchema = z.object({
  studentId: z.string().min(1, 'Invalid student ID'),
  month: z
    .string()
    .regex(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/, 
      'Month must be in format "May 2025"'),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, 'Format: 2024-2025'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  bankAccounts: z.string().optional(),
  items: z
    .array(feeItemSchema)
    .min(1, 'At least one fee item is required')
    .max(20, 'Maximum 20 fee items per challan'),
  discount: z.number().min(0).default(0),
  lateFee: z.number().min(0).default(0),
  notes: z.string().max(500).optional(),
})

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invalid invoice ID'),
  amount: z.number().positive('Payment amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Online', 'Cheque']),
  transactionId: z.string().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  remarks: z.string().max(500).optional(),
})

export const feeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  studentId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  proofStatus: z.string().optional(),
  month: z.string().optional(),
  academicYear: z.string().optional(),
  campusId: z.string().min(1).optional(),
})

export type GenerateChallanInput = z.infer<typeof generateChallanSchema>
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>
export type FeeQueryInput = z.infer<typeof feeQuerySchema>
