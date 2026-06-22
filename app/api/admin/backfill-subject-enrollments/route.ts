import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

/**
 * POST /api/admin/backfill-subject-enrollments
 *
 * One-time remediation endpoint: creates missing SubjectEnrollment records
 * for all students already enrolled in a ClassSection when a mandatory
 * SubjectOffering exists for that section.
 *
 * WHY this exists: Students enrolled before the auto-enrollment hook was
 * implemented are missing their SubjectEnrollment records. This endpoint
 * performs a safe, idempotent backfill.
 *
 * Security: SUPER_ADMIN only. Audit-logged.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'SUPER_ADMIN') return errors.forbidden('SUPER_ADMIN only')

  const log: string[] = []
  let totalCreated = 0

  // Get all mandatory SubjectOfferings
  const offerings = await prisma.subjectOffering.findMany({
    where: { isMandatory: true },
    select: { id: true, classSectionId: true, academicYearId: true },
  })

  log.push(`Found ${offerings.length} mandatory SubjectOffering(s) to process.`)

  for (const offering of offerings) {
    // Find active StudentEnrollments in this section/year
    const activeEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId: offering.classSectionId,
        academicYearId: offering.academicYearId,
        status: 'ACTIVE',
      },
      select: { id: true },
    })

    if (activeEnrollments.length === 0) continue

    // Find which ones already have a SubjectEnrollment for this offering
    const existing = await prisma.subjectEnrollment.findMany({
      where: {
        subjectOfferingId: offering.id,
        studentEnrollmentId: { in: activeEnrollments.map(e => e.id) },
      },
      select: { studentEnrollmentId: true },
    })

    const existingIds = new Set(existing.map(e => e.studentEnrollmentId))
    const missing = activeEnrollments.filter(e => !existingIds.has(e.id))

    if (missing.length === 0) {
      log.push(`Offering ${offering.id}: already in sync (${activeEnrollments.length} students).`)
      continue
    }

    const created = await prisma.subjectEnrollment.createMany({
      data: missing.map(enr => ({
        studentEnrollmentId: enr.id,
        subjectOfferingId: offering.id,
        status: 'APPROVED',
        approvedById: session.user.id,
      })),
      skipDuplicates: true,
    })

    totalCreated += created.count
    log.push(`Offering ${offering.id}: created ${created.count} missing enrollment(s).`)
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'BACKFILL',
      entityType: 'SubjectEnrollment',
      entityId: 'batch-backfill',
      changes: { totalCreated, offeringsProcessed: offerings.length },
    },
  })

  return successResponse(
    { totalCreated, offeringsProcessed: offerings.length, log },
    `Backfill complete. Created ${totalCreated} missing SubjectEnrollment records.`
  )
}
