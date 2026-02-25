-- Make learning materials optionally link to an appointment so admins can upload general resources.
ALTER TABLE `LearningMaterial` DROP FOREIGN KEY `LearningMaterial_bookingId_fkey`;
ALTER TABLE `LearningMaterial` MODIFY COLUMN `bookingId` VARCHAR(191) NULL;
ALTER TABLE `LearningMaterial` ADD CONSTRAINT `LearningMaterial_bookingId_fkey`
  FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
