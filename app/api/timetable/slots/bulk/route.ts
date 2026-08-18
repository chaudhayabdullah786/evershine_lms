/**
 * POST /api/timetable/slots/bulk
 *
 * Batch-creates multiple TimetableSlot records in a single transaction.
 * Each slot is validated independently via the existing engine validator.
 * Slots with conflicts are skipped and reported; valid ones are committed atomically.
 *
 * WHY: The single-slot POST endpoint requires one network round-trip per subject.
 * When a Superadmin assigns 6–8 subjects to a class section on a given day,
 * issuing 8 sequential POST requests creates race conditions, partial-write states,
 * and poor UX. Bulk creation with per-slot conflict reporting solves all three.
 *
 * TRADEOFF: We use a single transaction for all valid slots. A conflict on one
 * slot does NOT roll back the others — only that slot is skipped. This is
 * intentional: partial success is better than full failure for batch operations.
 * HOWEVER: we do commit all valid slots atomically via the transaction, so if the
 * DB itself fails (e.g. disk full), all roll back together.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { createTimetableSlotSchema } from '@/lib/validation/academic'
import { assertAcademicYearEditable, validateTimetableSlot } from '@/lib/academic/engine'
import type { Prisma, Role } from '@prisma/client'
import { z } from 'zod'

const bulkCreateSchema = z.object({
  slots: z
    .array(
      z.object({
        academicYearId: z.string().min(1),
        classSectionId: z.string().min(1),
        subjectOfferingId: z.string().min(1),
        teacherId: z.string().min(1).optional().nullable(),
        roomId: z.string().min(1).optional().nullable(),
        slotType: z.enum(['SUBJECT', 'BREAK', 'PRAYER', 'LUNCH', 'ASSEMBLY', 'ACTIVITY']).default('SUBJECT'),
        dayOfWeek: z.coerce.number().int().min(1).max(7),
        startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
      })
    )
    .min(1, 'At least one slot must be provided')
    .max(30, 'Maximum 30 slots per bulk request'),
})

type BulkSlotResult = {
  index: number
  subjectOfferingId: string
  status: 'created' | 'conflict' | 'invalid'
  slotId?: string
  conflicts?: string[]
  error?: string
}

function normalizeTime(t: string): string {
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'create')
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.badRequest('Invalid JSON body')
  }

  const parsed = bulkCreateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const results: BulkSlotResult[] = []
  const validSlots: Array<{ index: number; data: Prisma.TimetableSlotUncheckedCreateInput }> = []

  // Phase 1: Validate all slots before any writes
  for (let i = 0; i < parsed.data.slots.length; i++) {
    const raw = parsed.data.slots[i]

    // Normalize time format
    const slotData = {
      ...raw,
      startTime: normalizeTime(raw.startTime),
      endTime: normalizeTime(raw.endTime),
    }

    // Validate with Zod schema
    const slotParsed = createTimetableSlotSchema.safeParse(slotData)
    if (!slotParsed.success) {
      results.push({
        index: i,
        subjectOfferingId: raw.subjectOfferingId,
        status: 'invalid',
        error: slotParsed.error.errors.map((e) => e.message).join('; '),
      })
      continue
    }

    // Check academic year is editable
    try {
      await assertAcademicYearEditable(slotParsed.data.academicYearId!)
    } catch {
      results.push({
        index: i,
        subjectOfferingId: raw.subjectOfferingId,
        status: 'invalid',
        error: 'Academic year is locked',
      })
      continue
    }

    // Run conflict detection
    const conflicts = await validateTimetableSlot({
      academicYearId: slotParsed.data.academicYearId!,
      classSectionId: slotParsed.data.classSectionId!,
      subjectOfferingId: slotParsed.data.subjectOfferingId!,
      teacherId: slotParsed.data.teacherId ?? null,
      roomId: slotParsed.data.roomId,
      dayOfWeek: slotParsed.data.dayOfWeek!,
      startTime: slotParsed.data.startTime!,
      endTime: slotParsed.data.endTime!,
    })

    if (conflicts.length > 0) {
      results.push({
        index: i,
        subjectOfferingId: raw.subjectOfferingId,
        status: 'conflict',
        conflicts: conflicts.map((c) => c.message),
      })
      continue
    }

    validSlots.push({
      index: i,
      data: {
        academicYearId: slotParsed.data.academicYearId!,
        classSectionId: slotParsed.data.classSectionId!,
        subjectOfferingId: slotParsed.data.subjectOfferingId!,
        teacherId: slotParsed.data.teacherId ?? null,
        roomId: slotParsed.data.roomId ?? null,
        slotType: slotParsed.data.slotType,
        dayOfWeek: slotParsed.data.dayOfWeek!,
        startTime: slotParsed.data.startTime!,
        endTime: slotParsed.data.endTime!,
        isPublished: false,
      },
    })
  }

  // Phase 2: Write all valid slots in a single transaction
  if (validSlots.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const { index, data } of validSlots) {
          const created = await tx.timetableSlot.create({ data })
          await tx.auditLog.create({
            data: {
              userId: session.user.id,
              action: 'CREATE',
              entityType: 'TimetableSlot',
              entityId: created.id,
              changes: {
                academicYearId: data.academicYearId,
                classSectionId: data.classSectionId,
                subjectOfferingId: data.subjectOfferingId,
                teacherId: data.teacherId ?? null,
                roomId: data.roomId ?? null,
                slotType: data.slotType,
                dayOfWeek: data.dayOfWeek,
                startTime: data.startTime,
                endTime: data.endTime,
                isPublished: false,
              },
            },
          })
          results.push({
            index,
            subjectOfferingId: data.subjectOfferingId,
            status: 'created',
            slotId: created.id,
          })
        }
      })
    } catch (err) {
      console.error('[BULK SLOT CREATE] Transaction failed:', err)
      return errors.internal()
    }
  }

  // Sort results by original index for predictable response ordering
  results.sort((a, b) => a.index - b.index)

  const created = results.filter((r) => r.status === 'created').length
  const failed = results.filter((r) => r.status !== 'created').length

  return successResponse(
    { results, summary: { total: parsed.data.slots.length, created, failed } },
    `${created} slot(s) created, ${failed} skipped`
  )
}
