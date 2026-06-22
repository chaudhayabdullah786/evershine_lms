import { z } from 'zod'

export const markTeacherAttendanceSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  remarks: z.string().optional().nullable(),
})

export type MarkTeacherAttendanceInput = z.infer<typeof markTeacherAttendanceSchema>
