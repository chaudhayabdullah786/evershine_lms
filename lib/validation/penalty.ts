import { z } from 'zod'

export const assessmentActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'WAIVE', 'POST']),
  note: z.string().trim().max(500).optional(),
})
