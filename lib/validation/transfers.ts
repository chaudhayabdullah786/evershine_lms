import { z } from 'zod'

export const adminTransferSchema = z.object({
  entityType: z.enum(['STUDENT', 'TEACHER', 'CLASS']),
  entityId: z.string().cuid('Invalid entity ID'),
  targetCampusId: z.string().cuid().optional(),
  targetBatchId: z.string().cuid().optional(),
  targetClassId: z.string().cuid().optional(),
  targetHouseId: z.string().cuid().optional().nullable(),
  notifyUser: z.boolean().default(true),
})

export type AdminTransferInput = z.infer<typeof adminTransferSchema>
