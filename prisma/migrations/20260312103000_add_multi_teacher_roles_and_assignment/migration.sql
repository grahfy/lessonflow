-- Add owner/teacher staff roles plus teacher-assignment fields across
-- customers, requests, bookings, and recurring series.

ALTER TABLE `AdminUser`
  ADD COLUMN `role` ENUM('owner', 'teacher') NOT NULL DEFAULT 'owner',
  ADD COLUMN `firstName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `lastName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `age` INTEGER NULL,
  ADD COLUMN `unitNumber` VARCHAR(191) NULL,
  ADD COLUMN `houseNumber` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `streetName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `streetType` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `suburb` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `state` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `postcode` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `instruments` LONGTEXT NULL,
  ADD COLUMN `specialisations` LONGTEXT NULL,
  ADD COLUMN `background` LONGTEXT NULL,
  ADD COLUMN `musicalHistory` LONGTEXT NULL,
  ADD COLUMN `profilePhotoStorageKey` VARCHAR(191) NULL,
  ADD COLUMN `profilePhotoMimeType` VARCHAR(191) NULL;

ALTER TABLE `Customer`
  ADD COLUMN `primaryTeacherId` VARCHAR(191) NULL;

ALTER TABLE `BookingRequest`
  ADD COLUMN `assignedTeacherId` VARCHAR(191) NULL;

ALTER TABLE `BookingSeries`
  ADD COLUMN `assignedTeacherId` VARCHAR(191) NULL;

ALTER TABLE `Booking`
  ADD COLUMN `assignedTeacherId` VARCHAR(191) NULL;

CREATE INDEX `Customer_primaryTeacherId_idx` ON `Customer`(`primaryTeacherId`);
CREATE INDEX `BookingRequest_assignedTeacherId_idx` ON `BookingRequest`(`assignedTeacherId`);
CREATE INDEX `BookingSeries_assignedTeacherId_idx` ON `BookingSeries`(`assignedTeacherId`);
CREATE INDEX `Booking_assignedTeacherId_idx` ON `Booking`(`assignedTeacherId`);

ALTER TABLE `Customer`
  ADD CONSTRAINT `Customer_primaryTeacherId_fkey`
  FOREIGN KEY (`primaryTeacherId`) REFERENCES `AdminUser`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `BookingRequest`
  ADD CONSTRAINT `BookingRequest_assignedTeacherId_fkey`
  FOREIGN KEY (`assignedTeacherId`) REFERENCES `AdminUser`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `BookingSeries`
  ADD CONSTRAINT `BookingSeries_assignedTeacherId_fkey`
  FOREIGN KEY (`assignedTeacherId`) REFERENCES `AdminUser`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `Booking`
  ADD CONSTRAINT `Booking_assignedTeacherId_fkey`
  FOREIGN KEY (`assignedTeacherId`) REFERENCES `AdminUser`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
