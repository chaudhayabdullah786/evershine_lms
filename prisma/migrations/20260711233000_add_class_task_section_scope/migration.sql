ALTER TABLE `ClassTask`
  ADD COLUMN `classSectionId` VARCHAR(191) NULL;

CREATE INDEX `ClassTask_classSectionId_idx`
  ON `ClassTask`(`classSectionId`);

ALTER TABLE `ClassTask`
  ADD CONSTRAINT `ClassTask_classSectionId_fkey`
  FOREIGN KEY (`classSectionId`) REFERENCES `ClassSection`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
