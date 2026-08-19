-- Attendance penalty rules and auditable, manually posted assessments.
-- This migration is intentionally additive. It does not change or delete
-- existing attendance, fee, leave, or salary rows.

ALTER TABLE `FeePolicy`
  ADD COLUMN `allowedAbsencesPerMonth` INT NOT NULL DEFAULT 3,
  ADD COLUMN `absencePenaltyAmount` DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE `TeacherPenaltyPolicy`
  ADD COLUMN `lateGraceMinutes` INT NOT NULL DEFAULT 25,
  ADD COLUMN `freeLatePasses` INT NOT NULL DEFAULT 0;

CREATE TABLE `PenaltyAssessment` (
  `id` VARCHAR(191) NOT NULL,
  `type` ENUM('STUDENT_ABSENCE','STUDENT_LEAVE','TEACHER_LATE','TEACHER_LEAVE') NOT NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','WAIVED','POSTED','REVERSED') NOT NULL DEFAULT 'PENDING',
  `sourceId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NULL,
  `teacherId` VARCHAR(191) NULL,
  `policyId` VARCHAR(191) NULL,
  `teacherPolicyId` VARCHAR(191) NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `periodStart` DATETIME(3) NULL,
  `periodEnd` DATETIME(3) NULL,
  `feeInvoiceId` VARCHAR(191) NULL,
  `salarySlipId` VARCHAR(191) NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `postedAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `PenaltyAssessment_type_sourceId_key` (`type`,`sourceId`),
  KEY `PenaltyAssessment_status_type_idx` (`status`,`type`),
  KEY `PenaltyAssessment_studentId_createdAt_idx` (`studentId`,`createdAt`),
  KEY `PenaltyAssessment_teacherId_createdAt_idx` (`teacherId`,`createdAt`),
  KEY `PenaltyAssessment_teacherPolicyId_idx` (`teacherPolicyId`),
  KEY `PenaltyAssessment_feeInvoiceId_idx` (`feeInvoiceId`),
  KEY `PenaltyAssessment_salarySlipId_idx` (`salarySlipId`),
  CONSTRAINT `PenaltyAssessment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyAssessment_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyAssessment_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `FeePolicy` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyAssessment_teacherPolicyId_fkey` FOREIGN KEY (`teacherPolicyId`) REFERENCES `TeacherPenaltyPolicy` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyAssessment_feeInvoiceId_fkey` FOREIGN KEY (`feeInvoiceId`) REFERENCES `FeeInvoice` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyAssessment_salarySlipId_fkey` FOREIGN KEY (`salarySlipId`) REFERENCES `SalarySlip` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
