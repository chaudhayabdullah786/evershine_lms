-- Result-card display preferences are additive and safe for existing results.
ALTER TABLE `TermResult`
  ADD COLUMN `manualPosition` INT NULL;

CREATE TABLE `ResultCardConfig` (
  `id` VARCHAR(191) NOT NULL,
  `classSectionId` VARCHAR(191) NOT NULL,
  `examSessionId` VARCHAR(191) NOT NULL,
  `examTitleOverride` VARCHAR(120) NULL,
  `academyNameOverride` VARCHAR(120) NULL,
  `showStudentInfo` BOOLEAN NOT NULL DEFAULT true,
  `showSubjectNames` BOOLEAN NOT NULL DEFAULT true,
  `showTotalMarks` BOOLEAN NOT NULL DEFAULT true,
  `showObtainedMarks` BOOLEAN NOT NULL DEFAULT true,
  `showPercentage` BOOLEAN NOT NULL DEFAULT true,
  `showGrade` BOOLEAN NOT NULL DEFAULT true,
  `showResultStatus` BOOLEAN NOT NULL DEFAULT true,
  `showTeacherRemarks` BOOLEAN NOT NULL DEFAULT true,
  `showPerformanceBatch` BOOLEAN NOT NULL DEFAULT true,
  `showCustomFields` BOOLEAN NOT NULL DEFAULT true,
  `showClassPosition` BOOLEAN NOT NULL DEFAULT false,
  `positionMode` ENUM('HIDDEN', 'SYSTEM_APPROVED', 'MANUAL') NOT NULL DEFAULT 'HIDDEN',
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ResultCardConfig_classSectionId_examSessionId_key` (`classSectionId`, `examSessionId`),
  KEY `ResultCardConfig_examSessionId_idx` (`examSessionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
