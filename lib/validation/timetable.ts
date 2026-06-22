import { z } from 'zod'
import { sessionShiftSchema } from './shift'

export const createTimetableSchema = z.object({
  classId: z.string().min(1, 'Class is required'),
  teacherId: z.string().min(1, 'Teacher is required'),
  dayOfWeek: z.coerce.number().int().min(0).max(6, 'Day of week must be between 0 (Monday) and 6 (Sunday)'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:MM format'),
  subjectName: z.string().min(1, 'Subject name is required'),
  academicYear: z.string().min(4, 'Academic year is required'),
  shift: sessionShiftSchema.default('MORNING'),
  isActive: z.boolean().default(true),
})

export const updateTimetableSchema = createTimetableSchema.partial()

export type CreateTimetableInput = z.infer<typeof createTimetableSchema>
export type UpdateTimetableInput = z.infer<typeof updateTimetableSchema>
