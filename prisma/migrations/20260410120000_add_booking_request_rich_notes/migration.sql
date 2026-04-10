-- AlterTable
ALTER TABLE `BookingRequest` ADD COLUMN `notesContent` JSON NULL;

-- CreateTable
CREATE TABLE `BookingRequestNoteImage` (
    `id` VARCHAR(191) NOT NULL,
    `bookingRequestId` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingRequestNoteImage_bookingRequestId_idx`(`bookingRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BookingRequestNoteImage` ADD CONSTRAINT `BookingRequestNoteImage_bookingRequestId_fkey` FOREIGN KEY (`bookingRequestId`) REFERENCES `BookingRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
