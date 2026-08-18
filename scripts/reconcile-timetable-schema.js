#!/usr/bin/env node

/**
 * Idempotent, additive MySQL reconciliation for the timetable engine.
 *
 * This is intentionally an operator-run script. It does not drop tables,
 * delete rows, or rewrite existing timetable data. It exists because the
 * repository contains historical PostgreSQL migration metadata while
 * production is MySQL, so `prisma migrate deploy` cannot be used safely for
 * this one-time schema repair.
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function rows(sql, ...params) {
  return prisma.$queryRawUnsafe(sql, ...params)
}

async function tableExists(name) {
  const result = await rows(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    name,
  )
  return result.length > 0
}

async function column(name, columnName) {
  const result = await rows(
    'SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    name,
    columnName,
  )
  return result[0] ?? null
}

async function indexExists(tableName, indexName) {
  const result = await rows(
    'SELECT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    tableName,
    indexName,
  )
  return result.length > 0
}

async function foreignKeyExists(tableName, columnName, referencedTable) {
  const result = await rows(
    `SELECT CONSTRAINT_NAME AS name
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME = ?
      LIMIT 1`,
    tableName,
    columnName,
    referencedTable,
  )
  return result.length > 0
}

async function main() {
  const requiredBaseTables = ['AcademicYear', 'ClassSection', 'SubjectOffering', 'Teacher', 'Room', 'Shift', 'User', 'TimetableSlot']
  const missing = []
  for (const table of requiredBaseTables) {
    if (!(await tableExists(table))) missing.push(table)
  }
  if (missing.length > 0) {
    throw new Error(`Base academic tables are missing: ${missing.join(', ')}. Restore the verified schema backup before continuing.`)
  }

  const slotType = await column('TimetableSlot', 'slotType')
  if (!slotType) {
    await prisma.$executeRawUnsafe("ALTER TABLE `TimetableSlot` ADD COLUMN `slotType` ENUM('SUBJECT','BREAK','PRAYER','LUNCH','ASSEMBLY','ACTIVITY') NOT NULL DEFAULT 'SUBJECT'")
    console.log('Added TimetableSlot.slotType')
  }

  const templateId = await column('TimetableSlot', 'templateId')
  if (!templateId) {
    await prisma.$executeRawUnsafe('ALTER TABLE `TimetableSlot` ADD COLUMN `templateId` VARCHAR(191) NULL')
    console.log('Added TimetableSlot.templateId')
  }

  const teacherId = await column('TimetableSlot', 'teacherId')
  if (teacherId && teacherId.nullable !== 'YES') {
    await prisma.$executeRawUnsafe('ALTER TABLE `TimetableSlot` MODIFY COLUMN `teacherId` VARCHAR(191) NULL')
    console.log('Made TimetableSlot.teacherId nullable for period blocks')
  }

  if (!(await tableExists('TimetableTemplate'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`TimetableTemplate\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`academicYearId\` VARCHAR(191) NOT NULL,
        \`shiftId\` VARCHAR(191) NULL,
        \`name\` VARCHAR(120) NOT NULL,
        \`definition\` JSON NOT NULL,
        \`createdById\` VARCHAR(191) NOT NULL,
        \`isActive\` BOOLEAN NOT NULL DEFAULT true,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`TimetableTemplate_academicYearId_idx\` (\`academicYearId\`),
        INDEX \`TimetableTemplate_shiftId_idx\` (\`shiftId\`),
        INDEX \`TimetableTemplate_createdById_idx\` (\`createdById\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('Created TimetableTemplate')
  }

  if (!(await indexExists('TimetableSlot', 'TimetableSlot_templateId_idx'))) {
    await prisma.$executeRawUnsafe('ALTER TABLE `TimetableSlot` ADD INDEX `TimetableSlot_templateId_idx` (`templateId`)')
    console.log('Added TimetableSlot.templateId index')
  }

  if (!(await foreignKeyExists('TimetableSlot', 'templateId', 'TimetableTemplate'))) {
    await prisma.$executeRawUnsafe('ALTER TABLE `TimetableSlot` ADD CONSTRAINT `TimetableSlot_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `TimetableTemplate` (`id`) ON DELETE SET NULL ON UPDATE CASCADE')
    console.log('Added TimetableSlot.templateId foreign key')
  }

  if (!(await foreignKeyExists('TimetableTemplate', 'academicYearId', 'AcademicYear'))) {
    await prisma.$executeRawUnsafe('ALTER TABLE `TimetableTemplate` ADD CONSTRAINT `TimetableTemplate_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE')
  }
  if (!(await foreignKeyExists('TimetableTemplate', 'shiftId', 'Shift'))) {
    await prisma.$executeRawUnsafe('ALTER TABLE `TimetableTemplate` ADD CONSTRAINT `TimetableTemplate_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift` (`id`) ON DELETE SET NULL ON UPDATE CASCADE')
  }
  if (!(await foreignKeyExists('TimetableTemplate', 'createdById', 'User'))) {
    await prisma.$executeRawUnsafe('ALTER TABLE `TimetableTemplate` ADD CONSTRAINT `TimetableTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE')
  }

  console.log('Timetable schema reconciliation completed without deleting or rewriting data.')
}

main()
  .catch((error) => {
    console.error(`Timetable schema reconciliation stopped: ${error.message}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
