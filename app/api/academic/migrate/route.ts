import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import {
  getLegacyMigrationStatus,
  migrateLegacyAcademicData,
} from '@/lib/academic/legacy-migrate'
import type { Role } from '@prisma/client'
import { z } from 'zod'

const postSchema = z.object({
  dryRun: z.boolean().optional(),
  academicYearId: z.string().cuid().optional(),
  migrateSections: z.boolean().optional(),
  migrateEnrollments: z.boolean().optional(),
  migrateSubjects: z.boolean().optional(),
  migrateTimetable: z.boolean().optional(),
  migrateAttendance: z.boolean().optional(),
})

/** GET — migration readiness snapshot. */
export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'read')
  if (denied) return denied

  const academicYearId = new URL(request.url).searchParams.get('academicYearId') ?? undefined
  const status = await getLegacyMigrationStatus(academicYearId)
  return successResponse(status)
}

/** POST — run legacy → engine migration (SUPER_ADMIN / ADMIN with academic_years update). */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'academic_years', 'update')
  if (denied) return denied

  let raw: unknown = {}
  try {
    raw = await request.json()
  } catch {
    raw = {}
  }
  const parsed = postSchema.safeParse(raw)
  if (!parsed.success) return errors.validation(parsed.error)

  const result = await migrateLegacyAcademicData(parsed.data)

  if (!parsed.data.dryRun && session.user.id) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'LegacyAcademicMigration',
        entityId: result.academicYear?.id ?? 'unknown',
        changes: {
          sectionsCreated: result.sectionsCreated,
          sectionsMatched: result.sectionsMatched,
          enrollmentsCreated: result.enrollmentsCreated,
          offeringsCreated: result.offeringsCreated,
          timetableSlotsCreated: result.timetableSlotsCreated,
          attendanceRecordsCreated: result.attendanceRecordsCreated,
          errorCount: result.errors.length,
        },
      },
    })
  }

  return successResponse(
    result,
    parsed.data.dryRun ? 'Dry run complete (no changes written)' : 'Legacy migration complete'
  )
}
