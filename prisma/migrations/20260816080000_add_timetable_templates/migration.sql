-- Timetable automation migration.
-- Safe for existing data: teacherId becomes nullable and existing subject slots
-- retain their current teacher assignments. New template metadata is additive.

ALTER TABLE `TimetableSlot`
  DROP FOREIGN KEY `TimetableSlot_teacherId_fkey`;

ALTER TABLE `TimetableSlot`
  MODIFY COLUMN `teacherId` VARCHAR(191) NULL,
  ADD COLUMN `slotType` ENUM('SUBJECT', 'BREAK', 'PRAYER', 'LUNCH', 'ASSEMBLY', 'ACTIVITY') NOT NULL DEFAULT 'SUBJECT',
  ADD COLUMN `templateId` VARCHAR(191) NULL;

CREATE TABLE `TimetableTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `academicYearId` VARCHAR(191) NOT NULL,
  `shiftId` VARCHAR(191) NULL,
  `name` VARCHAR(120) NOT NULL,
  `definition` JSON NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `TimetableTemplate_academicYearId_idx` (`academicYearId`),
  INDEX `TimetableTemplate_shiftId_idx` (`shiftId`),
  INDEX `TimetableTemplate_createdById_idx` (`createdById`),
  CONSTRAINT `TimetableTemplate_academicYearId_fkey`
    FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TimetableTemplate_shiftId_fkey`
    FOREIGN KEY (`shiftId`) REFERENCES `Shift` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `TimetableTemplate_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TimetableSlot`
  ADD INDEX `TimetableSlot_templateId_idx` (`templateId`),
  ADD CONSTRAINT `TimetableSlot_teacherId_fkey`
    FOREIGN KEY (`teacherId`) REFERENCES `Teacher` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `TimetableSlot_templateId_fkey`
    FOREIGN KEY (`templateId`) REFERENCES `TimetableTemplate` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
