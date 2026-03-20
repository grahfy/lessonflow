CREATE TABLE `LessonPricingOption` (
  `id` VARCHAR(191) NOT NULL,
  `durationMinutes` INTEGER NOT NULL,
  `priceCents` INTEGER NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `LessonPricingOption_durationMinutes_key`(`durationMinutes`),
  INDEX `LessonPricingOption_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InvoiceBookingLink` (
  `id` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `bookingId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `InvoiceBookingLink_invoiceId_bookingId_key`(`invoiceId`, `bookingId`),
  INDEX `InvoiceBookingLink_bookingId_createdAt_idx`(`bookingId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `InvoiceBookingLink`
  ADD CONSTRAINT `InvoiceBookingLink_invoiceId_fkey`
    FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `InvoiceBookingLink`
  ADD CONSTRAINT `InvoiceBookingLink_bookingId_fkey`
    FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
