ALTER TABLE `DailyPerformanceScore`
  ADD COLUMN `grade` VARCHAR(191) NULL,
  ADD COLUMN `highlight` VARCHAR(191) NULL;

ALTER TABLE `MonthlyMonitoringReport`
  ADD COLUMN `declarationStatus` ENUM('DRAFT', 'DECLARED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `declaredAt` DATETIME(3) NULL,
  ADD COLUMN `declaredById` VARCHAR(191) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE INDEX `MonthlyMonitoringReport_declarationStatus_idx`
  ON `MonthlyMonitoringReport`(`declarationStatus`);
