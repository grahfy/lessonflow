-- Per-student nested folders for learning materials. `folderId` on LearningMaterial
-- is logical metadata only (storageKey/physical layout is never mirrored). The
-- folder-per-lesson DATA backfill lives in scripts/backfill-material-folders.ts and
-- is intentionally NOT part of this structural migration.

-- CreateTable
CREATE TABLE `StudentMaterialFolder` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `sourceBookingId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StudentMaterialFolder_customerId_sourceBookingId_key`(`customerId`, `sourceBookingId`),
    INDEX `StudentMaterialFolder_customerId_parentId_idx`(`customerId`, `parentId`),
    INDEX `StudentMaterialFolder_sourceBookingId_idx`(`sourceBookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `LearningMaterial` ADD COLUMN `folderId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `LearningMaterial_customerId_folderId_createdAt_idx` ON `LearningMaterial`(`customerId`, `folderId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `StudentMaterialFolder` ADD CONSTRAINT `StudentMaterialFolder_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentMaterialFolder` ADD CONSTRAINT `StudentMaterialFolder_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `StudentMaterialFolder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentMaterialFolder` ADD CONSTRAINT `StudentMaterialFolder_sourceBookingId_fkey`
  FOREIGN KEY (`sourceBookingId`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningMaterial` ADD CONSTRAINT `LearningMaterial_folderId_fkey`
  FOREIGN KEY (`folderId`) REFERENCES `StudentMaterialFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
