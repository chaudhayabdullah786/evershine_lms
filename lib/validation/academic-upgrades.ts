/**
 * lib/validation/academic-upgrades.ts
 * Zod input schemas for all 8 Academic Upgrade features.
 *
 * WHY centralised: All API route handlers and service layer use these schemas
 * as the single source of validation truth. Changing a field here propagates
 * everywhere via TypeScript inference — no silent drift.
 *
 * Schema naming convention: <verb><Entity>Schema, exported as-is so route
 * handlers can import exactly what they need without aliasing.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4: Enrollment Type Audited Update
// Maps directly to EnrollmentTypeAuditLog model (changedById, no academicYearId).
// ─────────────────────────────────────────────────────────────────────────────
export const enrollmentTypeEnum = z.enum(['REGULAR', 'SUPPLEMENTARY', 'PRACTICAL_ONLY', 'AUDIT'])

export const updateEnrollmentTypeSchema = z.object({
  studentId:      z.string().cuid('Invalid student ID'),
  academicYearId: z.string().cuid('Invalid academic year ID'),
  enrollmentType: enrollmentTypeEnum,
  reason:         z.string().min(5, 'Reason must be at least 5 characters').max(500),
  // Optional scope overrides — stored as JSON on StudentEnrollment
  courseScope:    z.string().optional(),    // e.g. "SELECTED_COURSES" | "ALL"
  timetableScope: z.string().optional(),   // e.g. "MODIFIED_TIMETABLE" | "ALL"
})

export type UpdateEnrollmentTypeInput = z.infer<typeof updateEnrollmentTypeSchema>

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3: Exam Date Sheets
// ExamDateSheetSlot.subjectOfferingId is required — it is a FK to SubjectOffering.
// ─────────────────────────────────────────────────────────────────────────────
export const examSlotSchema = z.object({
  subjectOfferingId: z.string().cuid('Invalid subject offering ID'),
  examDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  startTime:         z.string().min(1, 'Start time required'),
  endTime:           z.string().min(1, 'End time required'),
  roomNumber:        z.string().max(50).optional(),
})

export const saveDateSheetSchema = z.object({
  classSectionId: z.string().cuid('Invalid class section ID'),
  examSessionId:  z.string().cuid('Invalid exam session ID'),
  title:          z.string().min(3, 'Title must be at least 3 characters').max(200),
  slots:          z.array(examSlotSchema).min(1, 'At least one slot is required'),
})

export const examOverrideSchema = z.object({
  subjectOfferingId: z.string().cuid(),
  examDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:         z.string().min(1),
  endTime:           z.string().min(1),
})

export const createExamOverrideSchema = z.object({
  dateSheetId: z.string().cuid(),
  studentId:   z.string().cuid(),
  overrides:   z.array(examOverrideSchema).min(1),
})

export type SaveDateSheetInput    = z.infer<typeof saveDateSheetSchema>
export type CreateExamOverrideInput = z.infer<typeof createExamOverrideSchema>

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 5: Teacher Result Entry
// subjectOfferingId is the FK on SubjectResult — subjectName is for display only.
// obtainedMarks is nullable ("Input Decide Later" workflow).
// ─────────────────────────────────────────────────────────────────────────────
export const subjectScoreInputSchema = z.object({
  subjectOfferingId: z.string().cuid('Invalid subject offering ID'),
  totalMarks:        z.number().int().min(1),
  obtainedMarks: z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? null : Number(v)),
    z.number().min(0).max(9999).nullable(),
  ),
  isAbsent:        z.boolean().default(false),
  isNotApplicable: z.boolean().default(false),
  remarks:         z.string().max(500).optional(),
})

export const submitScoresSchema = z.object({
  classSectionId: z.string().cuid('Invalid class section ID'),
  examSessionId:  z.string().cuid('Invalid exam session ID'),
  studentId:      z.string().cuid('Invalid student ID'),
  scores:         z.array(subjectScoreInputSchema).min(1, 'At least one subject score is required'),
})

export const declareResultSchema = z.object({
  classSectionId: z.string().cuid(),
  examSessionId:  z.string().cuid(),
  declare:        z.boolean(),
})

export type SubmitScoresInput   = z.infer<typeof submitScoresSchema>
export type DeclareResultInput  = z.infer<typeof declareResultSchema>

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6: Daily Performance Scoring
// ─────────────────────────────────────────────────────────────────────────────
export const dailyScoreRecordSchema = z.object({
  studentId: z.string().cuid('Invalid student ID'),
  // WHY no .max() here: upper bound is offering-specific (SubjectOffering.maxDailyScore)
  // and validated server-side in AcademicUpgradesService.submitDailyPerformance().
  score:     z.number().min(0),
  isAbsent:  z.boolean().default(false),
  remarks:   z.string().max(200).optional(),
})

export const submitDailyPerformanceSchema = z.object({
  subjectOfferingId: z.string().cuid('Invalid subject offering ID'),
  date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  records:           z.array(dailyScoreRecordSchema).min(1, 'At least one record required'),
})

export type SubmitDailyPerformanceInput = z.infer<typeof submitDailyPerformanceSchema>

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 7: Monthly Test Comparison Report (Query params — no body schema)
// ─────────────────────────────────────────────────────────────────────────────
export const comparisonQuerySchema = z.object({
  classSectionId:        z.string().cuid(),
  currentExamSessionId:  z.string().cuid(),
  previousExamSessionId: z.string().cuid(),
})

export type ComparisonQueryInput = z.infer<typeof comparisonQuerySchema>

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 8: Marks Achievement Targets
// Assigns a letter-grade target; percentage bounds are derived server-side.
// ─────────────────────────────────────────────────────────────────────────────
export const studentTargetSchema = z.object({
  studentId:        z.string().cuid('Invalid student ID'),
  targetGrade:      z.enum(['A+', 'A', 'B', 'C', 'D']),
  targetPercentage: z.number().min(0).max(100).optional(), // Advisory; bounds computed from grade
})

export const assignTargetsSchema = z.object({
  classSectionId:   z.string().cuid('Invalid class section ID'),
  subjectOfferingId: z.string().cuid('Invalid subject offering ID'),
  targets:          z.array(studentTargetSchema).min(1, 'At least one target required'),
})

export type AssignTargetsInput = z.infer<typeof assignTargetsSchema>
