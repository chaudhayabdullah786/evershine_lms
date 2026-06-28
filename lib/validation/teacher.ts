/**
 * Teacher Zod Schemas
 *
 * WHY separate schema file: Both /api/teachers (POST) and /api/teachers/[id]
 * (PATCH) import from here. Keeping schemas co-located with routes would
 * cause duplication and drift between create/update shapes.
 *
 * TRADEOFF: updateTeacherSchema is a partial of createTeacherSchema with
 * certain immutable fields (cnic, email on the User record) excluded.
 * Email update on the Teacher entity is allowed (the display contact email),
 * but the auth User.email change requires a separate password-verified flow.
 */

import { z } from 'zod'
import { sessionShiftSchema } from './shift'

const genderEnum = z.enum(['MALE', 'FEMALE'])

// ── phoneRegex: Pakistan-compatible, also accepts landlines ──────────────────
const phoneRegex = /^\+?[\d\s\-]{10,15}$/

// ── Class assignment sub-schema ───────────────────────────────────────────────
const classAssignmentSchema = z.object({
  classId: z.string().cuid('Invalid class ID'),
  isClassTeacher: z.boolean().default(false),
})

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TEACHER
// Used by POST /api/teachers
// ─────────────────────────────────────────────────────────────────────────────
export const createTeacherSchema = z.object({
  // Personal
  firstName: z.string().min(2, 'First name must be at least 2 characters').trim(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').trim(),
  cnic: z.string()
    .min(1, 'CNIC is required')
    .transform(v => v.trim().replace(/[-\s]/g, ''))
    .refine(v => /^\d{13}$/.test(v), 'CNIC must be 13 digits'),
  dateOfBirth: z.string().datetime({ message: 'dateOfBirth must be an ISO datetime string' }),
  gender: genderEnum,

  // Professional
  qualification: z.string().min(2, 'Qualification is required').trim(),
  specialization: z.string().trim().optional(),
  experienceYears: z.number().int().min(0).default(0),
  joiningDate: z.string().datetime({ message: 'joiningDate must be an ISO datetime string' }),
  designation: z.string().min(2, 'Designation is required').trim(),
  monthlySalary: z.number().min(0).optional(),

  // Contact
  phoneNumber: z.string().regex(phoneRegex, 'Invalid phone number format').trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  address: z.string().min(5, 'Address is required').trim(),
  city: z.string().min(2, 'City is required').trim(),
  emergencyContact: z.string().regex(phoneRegex, 'Invalid emergency contact').trim(),

  // Placement
  campusId: z.string().cuid('Invalid campus ID'),
  // WHY optional: Non-teaching staff (sweeper, security guard) are not assigned to academic batches
  batchId: z.string().cuid().optional().or(z.literal('')).transform(v => v || undefined),
  houseId: z.string().cuid().optional().or(z.literal('')).transform(v => v || undefined),

  // Auth account
  password: z.string().min(8, 'Password must be at least 8 characters'),

  // Documents
  profilePicture: z.string().optional(),

  // WHY: When designation is "Other", the admin types a custom designation string
  customDesignation: z.string().trim().optional(),

  // Optional class assignments at creation time
  classAssignments: z.array(classAssignmentSchema).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE TEACHER (partial — no cnic/userId/employeeId)
// Used by PATCH /api/teachers/[id]
// ─────────────────────────────────────────────────────────────────────────────
export const updateTeacherSchema = createTeacherSchema
  .omit({ password: true, cnic: true, classAssignments: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    campusId: z.string().cuid('Invalid campus ID').optional(),
    batchId: z
      .string()
      .cuid()
      .optional()
      .nullable()
      .or(z.literal(''))
      .transform((v) => v || null),
    houseId: z
      .string()
      .cuid()
      .optional()
      .nullable()
      .or(z.literal(''))
      .transform((v) => v || null),
    designation: z.string().min(2, 'Designation is required').trim().optional(),
  })

// ─────────────────────────────────────────────────────────────────────────────
// QUERY PARAMS — GET /api/teachers
// ─────────────────────────────────────────────────────────────────────────────
export const teacherQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  campusId: z.string().cuid().optional(),
  batchId: z.string().cuid().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => {
      if (v === 'true') return true
      if (v === 'false') return false
      return undefined
    }),
})

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER ATTENDANCE — POST /api/teachers/[id]/attendance
// ─────────────────────────────────────────────────────────────────────────────
export const markTeacherAttendanceSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  shift: sessionShiftSchema.default('MORNING'),
  // WHY: ON_LEAVE is intentionally excluded — the Prisma schema AttendanceStatus enum
  // only defines PRESENT, ABSENT, LATE, EXCUSED. Use EXCUSED for planned leave.
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  remarks: z.string().trim().optional(),
})

export const teacherAttendanceQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  shift: sessionShiftSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(31),
})

// ─────────────────────────────────────────────────────────────────────────────
// CLASS ASSIGNMENT — POST /api/teachers/[id]/classes
// WHY dual-path: The system is migrating from legacy Class → ClassTeacher to
// Academic Engine ClassSection → SubjectOffering. During the transition, the
// schema accepts either classId (legacy) or classSectionId (new). The API
// handler prioritizes classSectionId when present.
// ─────────────────────────────────────────────────────────────────────────────
export const addClassAssignmentSchema = z.object({
  // Legacy path — assigns via ClassTeacher join table
  classId: z.string().cuid('Invalid class ID').optional(),
  // Academic Engine path — assigns via SubjectOffering or class-incharge flag
  classSectionId: z.string().cuid('Invalid class section ID').optional(),
  isClassTeacher: z.boolean().default(false),
  academicYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, 'Academic year must be YYYY-YYYY')
    .default('2026-2027'),
}).refine(
  (data) => !!data.classId || !!data.classSectionId,
  { message: 'Either classId or classSectionId is required', path: ['classId'] }
)

// ─────────────────────────────────────────────────────────────────────────────
// TIMETABLE QUERY — GET /api/teachers/[id]/timetable
// ─────────────────────────────────────────────────────────────────────────────
export const timetableQuerySchema = z.object({
  academicYear: z.string().optional(),
  shift: sessionShiftSchema.optional(),
  // WHY: Schema uses 0=Monday…5=Saturday. max(6) reserved for Sunday.
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>
export type TeacherQueryInput = z.infer<typeof teacherQuerySchema>
export type MarkTeacherAttendanceInput = z.infer<typeof markTeacherAttendanceSchema>
export type AddClassAssignmentInput = z.infer<typeof addClassAssignmentSchema>

// ─────────────────────────────────────────────────────────────────────────────
// NEW TEACHER PORTAL VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

export const classTaskSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').trim(),
  description: z.string().trim().optional(),
  type: z.enum(['ASSIGNMENT', 'QUIZ', 'CP', 'MID_TERM', 'FINAL_TERM', 'OTHER']),
  dueDate: z.string().datetime({ message: 'dueDate must be an ISO datetime string' }).optional().or(z.literal('')),
  maxMarks: z.number().int().min(1).default(100),
  classId: z.string().cuid('Invalid class ID'),
  subjectId: z.string().cuid('Invalid subject ID'),
})

export const taskMarksSchema = z.object({
  marks: z.array(
    z.object({
      studentId: z.string().cuid(),
      obtainedMarks: z.number().min(0),
      remarks: z.string().trim().optional(),
    })
  ),
})

export const teacherApplicationSchema = z.object({
  type: z.enum(['LEAVE', 'ADVANCE_SALARY', 'PROGRESS_UPDATE', 'OTHER']),
  title: z.string().min(3, 'Title is too short').trim(),
  description: z.string().min(10, 'Description should be detailed').trim(),
})

export const studentLeaveReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  remarks: z.string().trim().optional(),
})

export const teacherAvailabilitySchema = z.object({
  availabilities: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      arrivalTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid format (HH:MM)'),
      departureTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid format (HH:MM)'),
    })
  ),
})

export const teacherAnnouncementSchema = z.object({
  title: z.string().min(3, 'Title is required').trim(),
  content: z.string().min(5, 'Content is required').trim(),
  classId: z.string().cuid().optional().or(z.literal('')),
  batchId: z.string().cuid().optional().or(z.literal('')),
})

