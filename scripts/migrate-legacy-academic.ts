/**
 * CLI: migrate legacy Class/Student/Subject data into the academic engine.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-legacy-academic.ts
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-legacy-academic.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-legacy-academic.ts --timetable --attendance
 */
import {
  getLegacyMigrationStatus,
  migrateLegacyAcademicData,
} from '../lib/academic/legacy-migrate'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const migrateTimetable = args.includes('--timetable')
  const migrateAttendance = args.includes('--attendance')

  console.log('Migration status:', JSON.stringify(await getLegacyMigrationStatus(), null, 2))

  const result = await migrateLegacyAcademicData({
    dryRun,
    migrateSections: true,
    migrateEnrollments: true,
    migrateSubjects: true,
    migrateTimetable,
    migrateAttendance,
  })

  if (result.errors.length > 0) {
    console.warn(`${result.errors.length} migration warning(s):`)
    for (const err of result.errors.slice(0, 20)) {
      console.warn(`  [${err.entity}:${err.id}] ${err.message}`)
    }
    if (result.errors.length > 20) {
      console.warn(`  … and ${result.errors.length - 20} more`)
    }
  }

  console.log('Migration result:', JSON.stringify(result, null, 2))
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
