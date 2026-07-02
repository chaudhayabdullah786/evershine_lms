-- Expense actor tracking for Hostinger MySQL/MariaDB production databases.
-- Run once before deploying the matching application code if the DB is not managed by Prisma Migrate.

ALTER TABLE `Expense` DROP FOREIGN KEY `Expense_recordedBy_fkey`;
ALTER TABLE `Expense` MODIFY `recordedBy` VARCHAR(191) NULL;
ALTER TABLE `Expense` ADD COLUMN `recordedByUserId` VARCHAR(191) NULL;
UPDATE `Expense` SET `recordedByUserId` = `recordedBy` WHERE `recordedByUserId` IS NULL AND `recordedBy` IS NOT NULL;
CREATE INDEX `Expense_recordedByUserId_idx` ON `Expense`(`recordedByUserId`);
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_recordedBy_fkey` FOREIGN KEY (`recordedBy`) REFERENCES `Accountant`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_recordedByUserId_fkey` FOREIGN KEY (`recordedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
