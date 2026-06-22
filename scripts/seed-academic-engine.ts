/**
 * Idempotent academic engine bootstrap + optional demo section/enrollments.
 * Usage: npm run db:seed:academic
 * Set ACADEMIC_SEED_DEMO=false to skip demo section/enrollments.
 */
import { seedAcademicDemoData } from '../lib/academic/seed-demo'
import { ensureMonthlyFeedbackCycles } from '../lib/feedback/engine'

async function main() {
  const skipDemo = process.env.ACADEMIC_SEED_DEMO === 'false'
  const result = skipDemo
    ? {
        bootstrap: await import('../lib/academic/bootstrap').then((m) =>
          m.bootstrapAcademicFoundation({
            yearName: process.env.ACADEMIC_YEAR_NAME,
            startDate: process.env.ACADEMIC_YEAR_START,
            endDate: process.env.ACADEMIC_YEAR_END,
          })
        ),
        classSectionId: null,
        enrollmentsCreated: 0,
        subjectOfferingId: null,
      }
    : await seedAcademicDemoData()
  await ensureMonthlyFeedbackCycles()
  console.log('Academic seed:', JSON.stringify(result, null, 2))
  console.log('Monthly feedback cycles and questions are ready.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    const { prisma } = await import('../lib/prisma')
    await prisma.$disconnect()
  })
