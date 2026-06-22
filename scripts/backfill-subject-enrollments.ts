import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting SubjectEnrollment backfill...')

  // Get all mandatory SubjectOfferings
  const offerings = await prisma.subjectOffering.findMany({
    where: { isMandatory: true },
  })

  let totalCreated = 0

  for (const offering of offerings) {
    console.log(`Processing offering ${offering.id} (ClassSection: ${offering.classSectionId})`)

    // Find active student enrollments in this section
    const activeEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId: offering.classSectionId,
        academicYearId: offering.academicYearId,
        status: 'ACTIVE',
      },
      select: { id: true }
    })

    if (activeEnrollments.length === 0) continue

    // Find which ones already have a SubjectEnrollment for this offering
    const existingSubjectEnrollments = await prisma.subjectEnrollment.findMany({
      where: {
        subjectOfferingId: offering.id,
        studentEnrollmentId: { in: activeEnrollments.map(e => e.id) }
      },
      select: { studentEnrollmentId: true }
    })

    const existingIds = new Set(existingSubjectEnrollments.map(e => e.studentEnrollmentId))

    // Filter to missing ones
    const missingEnrollments = activeEnrollments.filter(e => !existingIds.has(e.id))

    if (missingEnrollments.length > 0) {
      console.log(`Creating ${missingEnrollments.length} missing SubjectEnrollments...`)
      
      const created = await prisma.subjectEnrollment.createMany({
        data: missingEnrollments.map(enr => ({
          studentEnrollmentId: enr.id,
          subjectOfferingId: offering.id,
          status: 'APPROVED',
        })),
        skipDuplicates: true
      })
      
      totalCreated += created.count
    }
  }

  console.log(`Backfill complete. Created ${totalCreated} new SubjectEnrollments.`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
