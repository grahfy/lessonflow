-- CreateTable
CREATE TABLE `SystemLog` (
    `id` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SystemLog_level_idx`(`level`),
    INDEX `SystemLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
