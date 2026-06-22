/**
 * Attendance Zod Schemas
 *
 * WHY date as string not Date: Next.js serializes JSON; Date objects
 * become strings in transit. Validate the string format, parse in service layer.
 */

import { z } from 'zod'
import { sessionShiftSchema } from './shift'

const attendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])

const attendanceRecordSchema = z.object({
  studentId: z.string().min(1, 'Invalid student ID'),
  status: attendanceStatusEnum,
  remarks: z.string().max(200).optional(),
})

export const submitAttendanceSchema = z.object({
  classId: z.string().min(1, 'Invalid class ID'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  shift: sessionShiftSchema.default('MORNING'),
  records: z
    .array(attendanceRecordSchema)
    .min(1, 'At least one attendance record required')
    .max(100, 'Maximum 100 records per submission'),
})

export const attendanceQuerySchema = z.object({
  classId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
  shift: sessionShiftSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: attendanceStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>
export type AttendanceQueryInput = z.infer<typeof attendanceQuerySchema>
