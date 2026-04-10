-- CreateTable
CREATE TABLE `StorageCleanupTask` (
    `id` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `scope` ENUM('booking_note_image', 'booking_request_note_image') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StorageCleanupTask_storageKey_key`(`storageKey`),
    INDEX `StorageCleanupTask_nextAttemptAt_createdAt_idx`(`nextAttemptAt`, `createdAt`),
    INDEX `StorageCleanupTask_scope_entityId_idx`(`scope`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
