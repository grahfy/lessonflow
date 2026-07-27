-- Booking-scoped references to shared Library masters. This is intentionally
-- separate from the customer-wide LibraryAssignment join so both placements can
-- coexist for the same student and LibraryItem.

CREATE TABLE `BookingLibraryMaterial` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `libraryItemId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingLibraryMaterial_libraryItemId_idx`(`libraryItemId`),
    INDEX `BookingLibraryMaterial_assignedById_idx`(`assignedById`),
    UNIQUE INDEX `BookingLibraryMaterial_bookingId_libraryItemId_key`(`bookingId`, `libraryItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BookingLibraryMaterial` ADD CONSTRAINT `BookingLibraryMaterial_bookingId_fkey`
  FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BookingLibraryMaterial` ADD CONSTRAINT `BookingLibraryMaterial_libraryItemId_fkey`
  FOREIGN KEY (`libraryItemId`) REFERENCES `LibraryItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BookingLibraryMaterial` ADD CONSTRAINT `BookingLibraryMaterial_assignedById_fkey`
  FOREIGN KEY (`assignedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
