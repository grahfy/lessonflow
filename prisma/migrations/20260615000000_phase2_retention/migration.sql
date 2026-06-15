-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `attendanceMarkedAt` DATETIME(3) NULL,
    ADD COLUMN `attendanceMarkedById` VARCHAR(191) NULL,
    ADD COLUMN `attendanceStatus` ENUM('attended', 'no_show') NULL,
    ADD COLUMN `reminderSentAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `BookingAuditLog` MODIFY `action` ENUM('created', 'approved', 'rejected', 'moved', 'cancelled', 'edited', 'reminder_sent', 'custom_email_sent', 'series_removed', 'attendance_marked', 'reschedule_requested', 'reschedule_approved', 'reschedule_declined', 'waitlisted', 'waitlist_promoted') NOT NULL;

-- AlterTable
ALTER TABLE `BookingRequest` MODIFY `status` ENUM('pending', 'approved', 'rejected', 'cancelled', 'waitlisted') NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE `NotificationSettings` ADD COLUMN `lessonReminderEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lessonReminderHoursBefore` INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE `BookingRescheduleRequest` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `requestedStartAt` DATETIME(3) NOT NULL,
    `reason` TEXT NULL,
    `status` ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,

    INDEX `BookingRescheduleRequest_status_idx`(`status`),
    INDEX `BookingRescheduleRequest_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BookingRescheduleRequest` ADD CONSTRAINT `BookingRescheduleRequest_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
