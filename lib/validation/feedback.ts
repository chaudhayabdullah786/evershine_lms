import { z } from 'zod'

export const feedbackLikertSchema = z.enum([
  'STRONGLY_AGREE',
  'AGREE',
  'NEUTRAL',
  'DISAGREE',
])

export const feedbackAnswerSchema = z.object({
  questionId: z.string().cuid(),
  response: feedbackLikertSchema,
})

export const submitTeacherFeedbackSchema = z.object({
  cycleId: z.string().cuid(),
  teacherId: z.string().cuid(),
  studentEnrollmentId: z.string().cuid(),
  comments: z.string().max(2000).optional(),
  answers: z.array(feedbackAnswerSchema).min(1),
})

export const createFeedbackQuestionSchema = z.object({
  text: z.string().min(5).max(500),
  orderIndex: z.number().int().min(0).optional(),
})

export const updateShiftTimesSchema = z
  .object({
    name: z.string().min(2).max(50).optional(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Use HH:mm format, e.g. 09:00')
      .optional(),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Use HH:mm format, e.g. 13:00')
      .optional(),
    lateGraceMinutes: z.number().int().min(0).max(120).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.lateGraceMinutes !== undefined,
    { message: 'At least one field (name, startTime, endTime, lateGraceMinutes) must be provided.' }
  )

export const LIKERT_LABELS: Record<
  'STRONGLY_AGREE' | 'AGREE' | 'NEUTRAL' | 'DISAGREE',
  string
> = {
  STRONGLY_AGREE: 'Strongly agree',
  AGREE: 'Agree',
  NEUTRAL: 'Neutral',
  DISAGREE: 'Disagree',
}
