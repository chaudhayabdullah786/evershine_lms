/**
 * POST /api/timetable/periods
 *
 * Seeds global "period block" subject offerings (Break, Prayer, Lunch, Assembly)
 * for a given classSectionId + academicYearId so they can be added as timetable slots.
 *
 * WHY: TimetableSlot still requires a subjectOfferingId FK so every grid entry can use
 * the same roster/query path. Non-academic periods (break, prayer, lunch) are represented
 * by reserved AcademicSubject/SubjectOffering records and are marked with the explicit
 * TimetableSlot.slotType value by the timetable APIs.
 *
 * TRADEOFF: Reserved subject codes (__BREAK__, __PRAYER__, etc.) remain implementation
 * details and must be filtered out of student-facing subject lists. The slotType field is
 * the stable presentation contract; the reserved offering only satisfies the FK.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { subjectOfferingUniqueWhere } from '@/lib/academic/timetable-keys'
import type { Role } from '@prisma/client'
import { z } from 'zod'

/** Reserved period block definitions */
const PERIOD_BLOCKS = [
  { code: '__BREAK__',    name: 'Break Period',  color: '#9CA3AF' },
  { code: '__PRAYER__',   name: 'Prayer Time',   color: '#6EE7B7' },
  { code: '__LUNCH__',    name: 'Lunch Break',   color: '#FCD34D' },
  { code: '__ASSEMBLY__', name: 'Assembly',      color: '#93C5FD' },
  { code: '__ACTIVITY__', name: 'Activity Block', color: '#C4B5FD' },
] as const

type PeriodCode = typeof PERIOD_BLOCKS[number]['code']

const seedPeriodsSchema = z.object({
  classSectionId: z.string().min(1, 'classSectionId is required'),
  academicYearId: z.string().min(1, 'academicYearId is required'),
  /** Optional: only seed specific period types */
  periodCodes: z
    .array(z.enum(['__BREAK__', '__PRAYER__', '__LUNCH__', '__ASSEMBLY__', '__ACTIVITY__']))
    .optional(),
})

/** GET — list all reserved period-type subjects */
export async function GET() {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'timetable_engine', 'read')
  if (denied) return denied

  return successResponse(
    PERIOD_BLOCKS.map((p) => ({ code: p.code, name: p.name, color: p.color })),
    'Period block types'
  )
}

/**
 * POST — ensure period-type SubjectOffering records exist for the given section/year.
 * Returns the upserted offerings so the caller can immediately create TimetableSlot records.
 */
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

  const parsed = seedPeriodsSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { classSectionId, academicYearId, periodCodes } = parsed.data

  // Validate that the class section and academic year exist
  const [section, academicYear] = await Promise.all([
    prisma.classSection.findUnique({ where: { id: classSectionId }, select: { id: true } }),
    prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true, isLocked: true } }),
  ])

  if (!section) return errors.notFound('Class section')
  if (!academicYear) return errors.notFound('Academic year')
  if (academicYear.isLocked) return errors.forbidden('Academic year is locked')

  const targetPeriods = periodCodes
    ? PERIOD_BLOCKS.filter((p) => (periodCodes as string[]).includes(p.code))
    : PERIOD_BLOCKS

  const seededOfferings: Array<{
    id: string
    code: PeriodCode
    name: string
    color: string
    classSectionId: string
    academicYearId: string
  }> = []

  try {
    await prisma.$transaction(async (tx) => {
      for (const period of targetPeriods) {
        // 1. Ensure the reserved AcademicSubject exists globally
        const subject = await tx.academicSubject.upsert({
          where: { code: period.code },
          create: { name: period.name, code: period.code },
          update: {},
        })

        // 2. Ensure a SubjectOffering exists for this section + year
        const offering = await tx.subjectOffering.upsert({
          where: subjectOfferingUniqueWhere(academicYearId, classSectionId, subject.id),
          create: {
            classSectionId,
            academicYearId,
            subjectId: subject.id,
            teacherId: null,     // Period blocks have no teacher
            isMandatory: true,
          },
          update: {},
        })

        seededOfferings.push({
          id: offering.id,
          code: period.code as PeriodCode,
          name: period.name,
          color: period.color,
          classSectionId,
          academicYearId,
        })
      }
    })
  } catch (err) {
    console.error('[PERIODS SEED] Transaction failed:', err)
    return errors.internal()
  }

  return successResponse(seededOfferings, `${seededOfferings.length} period block(s) ready`)
}
