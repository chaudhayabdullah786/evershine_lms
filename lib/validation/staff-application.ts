/**
 * Staff Application Validation Schema
 *
 * WHY: Shared between the public landing page submit API and the frontend modal.
 * Validates CNIC format (12345-1234567-1), Pakistani phone, email, and
 * professional profile fields.
 *
 * TRADEOFF: `applicantType` defaults to TEACHER since that's the 90% use case
 * from the landing page. Admin staff / accountant applications are less common
 * but supported via the same form with a type selector.
 */

import { z } from 'zod'

// ── Public submission schema (used by POST /api/staff-applications/apply) ────
export const staffApplicationSchema = z.object({
  // Identity
  fullName: z
    .string()
    .min(3, 'Full name must be at least 3 characters')
    .max(100, 'Name too long'),
  cnic: z
    .string()
    .regex(/^\d{5}-\d{7}-\d{1}$/, 'CNIC format must be 12345-1234567-1'),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  address: z.string().min(5, 'Address must be at least 5 characters').optional(),
  city: z.string().min(2, 'City is required').optional(),

  // Contact
  phone: z
    .string()
    .regex(/^(\+92|0)[0-9]{10}$/, 'Enter a valid Pakistani phone number'),
  email: z.string().email('Enter a valid email address'),

  // Professional profile
  applicantType: z
    .enum(['TEACHER', 'ACCOUNTANT', 'ADMIN_STAFF'])
    .default('TEACHER'),
  qualification: z.enum(
    ['BA/BSc', 'MA/MSc', 'MPhil', 'PhD', 'B.Ed', 'M.Ed', 'Other'],
    { errorMap: () => ({ message: 'Select a qualification' }) }
  ),
  specialization: z
    .string()
    .min(2, 'Enter your teaching subject or specialization'),
  experienceYears: z.coerce
    .number()
    .min(0, 'Experience cannot be negative')
    .max(50, 'Experience cannot exceed 50 years'),
  preferredShift: z.enum(['MORNING', 'EVENING', 'NIGHT']).optional(),
  preferredCampusId: z.string().optional(),

  // Documents
  cvDocBase64: z.string().optional(), // base64-encoded PDF
  cvLink: z.string().url('Enter a valid URL').optional().or(z.literal('')),
})

export type StaffApplicationInput = z.infer<typeof staffApplicationSchema>

// ── Admin review action schema (used by PATCH /api/staff-applications/[id]/review) ─
export const staffReviewSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    campusId: z.string().min(1, 'Campus is required for provisioning'),
    batchId: z.string().optional(),
    designation: z.string().min(2, 'Designation is required'),
    salary: z.coerce.number().min(0).optional(),
  }),
  z.object({
    action: z.literal('decline'),
    reason: z.string().min(5, 'Decline reason must be at least 5 characters'),
  }),
  z.object({
    action: z.literal('schedule_interview'),
    interviewDate: z.string().min(1, 'Interview date is required'),
    instructions: z.string().optional(),
  }),
  z.object({
    action: z.literal('hold'),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal('reopen'),
  }),
])

export type StaffReviewInput = z.infer<typeof staffReviewSchema>

// ── Inquiry submission schema (used by POST /api/landing/inquiries) ──────────
export const inquirySchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z
    .string()
    .regex(/^(\+92|0)[0-9]{10}$/, 'Enter a valid Pakistani phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message too long'),
})

export type InquiryInput = z.infer<typeof inquirySchema>

// ── Inquiry admin action schema ──────────────────────────────────────────────
export const inquiryActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reply'),
    replyText: z.string().min(5, 'Reply must be at least 5 characters'),
  }),
  z.object({
    action: z.literal('resolve'),
  }),
  z.object({
    action: z.literal('spam'),
  }),
])

export type InquiryActionInput = z.infer<typeof inquiryActionSchema>
