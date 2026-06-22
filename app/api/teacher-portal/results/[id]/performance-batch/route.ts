/**
 * PATCH /api/teacher-portal/results/[id]/performance-batch
 *
 * Teacher manually overrides the auto-calculated performance batch
 * for a specific student result. Override is audit-logged.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'

const VALID_BATCHES = [
  'Ever Shine',
  'Quaid',
  'Iqbal',
  'Improvement',
] as const

const patchSchema = z.object({
  performanceBatch: z.enum(VALID_BATCHES),
  reason: z.string().min(1, 'Override reason required').max(500),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params
    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const existing = await prisma.termResult.findUnique({ where: { id } })
    if (!existing) return errors.notFound('Result')

    const teachingSection = await prisma.subjectOffering.findFirst({
      where: { classSectionId: existing.classSectionId, teacherId: teacher.id },
    })
    if (!teachingSection) return errors.forbidden()

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.termResult.update({
        where: { id },
        data: {
          performanceBatch: parsed.data.performanceBatch,
          updatedAt: new Date(),
        },
      })

      // Audit: record manual override
      await tx.retroactiveScoreEditLog.create({
        data: {
          entityType: 'TERM_RESULT',
          entityId: id,
          previousMarks: JSON.stringify({ performanceBatch: existing.performanceBatch }),
          newMarks: JSON.stringify({ performanceBatch: parsed.data.performanceBatch }),
          reason: `Performance batch manual override: ${parsed.data.reason}`,
          editedById: session.user.id,
        },
      })

      return result
    })

    return successResponse(
      { performanceBatch: updated.performanceBatch },
      'Performance batch manually updated successfully'
    )
  } catch (err) {
    console.error('[PERFORMANCE_BATCH_PATCH]', err)
    return errors.internal()
  }
}
