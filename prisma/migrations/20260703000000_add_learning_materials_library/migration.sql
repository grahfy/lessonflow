-- Shared learning-materials Library (tagging, search, by-reference assignment).
--
-- Purely additive: four new tables that coexist with the strictly per-customer
-- `LearningMaterial` store. A `LibraryItem` is one master blob referenced BY
-- REFERENCE by many students via `LibraryAssignment` (one storageKey, N
-- assignees, edits propagate). `Tag` is a controlled shared vocabulary joined
-- through `LibraryItemTag`. No existing table or column is modified.

-- CreateTable
CREATE TABLE `LibraryItem` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `materialType` ENUM('audio', 'pdf', 'image') NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LibraryItem_storageKey_key`(`storageKey`),
    INDEX `LibraryItem_uploadedById_idx`(`uploadedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Tag_category_idx`(`category`),
    UNIQUE INDEX `Tag_category_value_key`(`category`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LibraryItemTag` (
    `id` VARCHAR(191) NOT NULL,
    `libraryItemId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,

    INDEX `LibraryItemTag_tagId_idx`(`tagId`),
    INDEX `LibraryItemTag_tagId_libraryItemId_idx`(`tagId`, `libraryItemId`),
    UNIQUE INDEX `LibraryItemTag_libraryItemId_tagId_key`(`libraryItemId`, `tagId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LibraryAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `libraryItemId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LibraryAssignment_customerId_idx`(`customerId`),
    INDEX `LibraryAssignment_assignedById_idx`(`assignedById`),
    UNIQUE INDEX `LibraryAssignment_libraryItemId_customerId_key`(`libraryItemId`, `customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LibraryItem` ADD CONSTRAINT `LibraryItem_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryItemTag` ADD CONSTRAINT `LibraryItemTag_libraryItemId_fkey` FOREIGN KEY (`libraryItemId`) REFERENCES `LibraryItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryItemTag` ADD CONSTRAINT `LibraryItemTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryAssignment` ADD CONSTRAINT `LibraryAssignment_libraryItemId_fkey` FOREIGN KEY (`libraryItemId`) REFERENCES `LibraryItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryAssignment` ADD CONSTRAINT `LibraryAssignment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LibraryAssignment` ADD CONSTRAINT `LibraryAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
