-- CreateTable
CREATE TABLE `AttendanceImportLog` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `importType` VARCHAR(191) NOT NULL,
    `totalRows` INTEGER NOT NULL,
    `successRows` INTEGER NOT NULL,
    `failedRows` INTEGER NOT NULL,
    `errorLog` JSON NULL,
    `importedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AttendanceImportLog` ADD CONSTRAINT `AttendanceImportLog_importedById_fkey` FOREIGN KEY (`importedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
