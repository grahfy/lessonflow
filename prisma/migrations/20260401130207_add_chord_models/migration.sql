-- CreateTable
CREATE TABLE `Chord` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `root` VARCHAR(191) NOT NULL,
    `quality` VARCHAR(191) NOT NULL,
    `diagram` JSON NOT NULL,
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Chord_isArchived_name_idx`(`isArchived`, `name`),
    INDEX `Chord_root_quality_isArchived_idx`(`root`, `quality`, `isArchived`),
    INDEX `Chord_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChordChart` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChordChart_isArchived_updatedAt_idx`(`isArchived`, `updatedAt`),
    INDEX `ChordChart_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChordChartItem` (
    `id` VARCHAR(191) NOT NULL,
    `chartId` VARCHAR(191) NOT NULL,
    `chordId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `annotation` VARCHAR(191) NULL,

    INDEX `ChordChartItem_chartId_sortOrder_idx`(`chartId`, `sortOrder`),
    INDEX `ChordChartItem_chordId_idx`(`chordId`),
    UNIQUE INDEX `ChordChartItem_chartId_chordId_key`(`chartId`, `chordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Chord` ADD CONSTRAINT `Chord_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChordChart` ADD CONSTRAINT `ChordChart_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChordChartItem` ADD CONSTRAINT `ChordChartItem_chartId_fkey` FOREIGN KEY (`chartId`) REFERENCES `ChordChart`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChordChartItem` ADD CONSTRAINT `ChordChartItem_chordId_fkey` FOREIGN KEY (`chordId`) REFERENCES `Chord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
