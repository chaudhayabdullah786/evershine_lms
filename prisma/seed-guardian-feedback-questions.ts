/**
 * Seed script for guardian/service feedback questions.
 * Run with: npx ts-node prisma/seed-guardian-feedback-questions.ts
 * OR import and call from existing seed pipeline.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SERVICE_QUESTIONS = [
  // LMS_SERVICES — portal, digital tools, online experience
  {
    category: 'LMS_SERVICES' as const,
    text: 'The student/parent portal is easy to navigate and use.',
    orderIndex: 0,
  },
  {
    category: 'LMS_SERVICES' as const,
    text: 'I can access attendance, results, and fee information conveniently.',
    orderIndex: 1,
  },
  {
    category: 'LMS_SERVICES' as const,
    text: 'The system notifications and alerts are timely and helpful.',
    orderIndex: 2,
  },
  {
    category: 'LMS_SERVICES' as const,
    text: 'I am satisfied with the overall digital experience of this LMS.',
    orderIndex: 3,
  },

  // ACADEMY_SERVICES — facilities, admin office, general satisfaction
  {
    category: 'ACADEMY_SERVICES' as const,
    text: 'The academy premises are clean and well-maintained.',
    orderIndex: 0,
  },
  {
    category: 'ACADEMY_SERVICES' as const,
    text: 'The administration office is responsive and helpful.',
    orderIndex: 1,
  },
  {
    category: 'ACADEMY_SERVICES' as const,
    text: 'Fee collection and billing processes are transparent and fair.',
    orderIndex: 2,
  },
  {
    category: 'ACADEMY_SERVICES' as const,
    text: 'Overall, I am satisfied with the academy\u2019s services and facilities.',
    orderIndex: 3,
  },
]

async function seedGuardianFeedbackQuestions() {
  console.log('Seeding guardian feedback questions...')

  for (const q of SERVICE_QUESTIONS) {
    // Upsert by text to avoid duplicates on re-run
    const existing = await prisma.feedbackQuestion.findFirst({
      where: { text: q.text },
    })

    if (!existing) {
      await prisma.feedbackQuestion.create({
        data: {
          category: q.category,
          text: q.text,
          orderIndex: q.orderIndex,
          isActive: true,
        },
      })
      console.log(`  ✓ Created: [${q.category}] ${q.text.slice(0, 50)}...`)
    } else {
      console.log(`  · Exists: [${q.category}] ${q.text.slice(0, 50)}...`)
    }
  }

  console.log('Done. Guardian feedback questions seeded.')
}

seedGuardianFeedbackQuestions()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
