-- CreateTable
CREATE TABLE `ContactSubmission` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `message` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingRequest` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `unitNumber` VARCHAR(191) NULL,
    `houseNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `streetName` VARCHAR(191) NOT NULL DEFAULT '',
    `streetType` VARCHAR(191) NOT NULL DEFAULT '',
    `suburb` VARCHAR(191) NOT NULL DEFAULT '',
    `state` VARCHAR(191) NOT NULL DEFAULT '',
    `postcode` VARCHAR(191) NOT NULL DEFAULT '',
    `lessonMode` ENUM('in_person', 'video') NOT NULL,
    `skillLevel` ENUM('beginner', 'intermediate', 'advanced') NOT NULL,
    `lessonDuration` ENUM('min30', 'min60') NOT NULL,
    `customDurationMinutes` INTEGER NULL,
    `requestedStartAt` DATETIME(3) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `recurrenceEndAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,

    INDEX `BookingRequest_requestedStartAt_status_idx`(`requestedStartAt`, `status`),
    INDEX `BookingRequest_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingSeries` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `unitNumber` VARCHAR(191) NULL,
    `houseNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `streetName` VARCHAR(191) NOT NULL DEFAULT '',
    `streetType` VARCHAR(191) NOT NULL DEFAULT '',
    `suburb` VARCHAR(191) NOT NULL DEFAULT '',
    `state` VARCHAR(191) NOT NULL DEFAULT '',
    `postcode` VARCHAR(191) NOT NULL DEFAULT '',
    `lessonMode` ENUM('in_person', 'video') NOT NULL,
    `skillLevel` ENUM('beginner', 'intermediate', 'advanced') NOT NULL,
    `lessonDuration` ENUM('min30', 'min60') NOT NULL,
    `customDurationMinutes` INTEGER NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `startTimeLocal` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `recurrenceEndAt` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `customerId` VARCHAR(191) NULL,

    INDEX `BookingSeries_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('approved', 'cancelled') NOT NULL DEFAULT 'approved',
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `unitNumber` VARCHAR(191) NULL,
    `houseNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `streetName` VARCHAR(191) NOT NULL DEFAULT '',
    `streetType` VARCHAR(191) NOT NULL DEFAULT '',
    `suburb` VARCHAR(191) NOT NULL DEFAULT '',
    `state` VARCHAR(191) NOT NULL DEFAULT '',
    `postcode` VARCHAR(191) NOT NULL DEFAULT '',
    `lessonMode` ENUM('in_person', 'video') NOT NULL,
    `skillLevel` ENUM('beginner', 'intermediate', 'advanced') NOT NULL,
    `lessonDuration` ENUM('min30', 'min60') NOT NULL,
    `customDurationMinutes` INTEGER NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `requestId` VARCHAR(191) NULL,
    `seriesId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `modifiedById` VARCHAR(191) NULL,

    INDEX `Booking_startAt_status_idx`(`startAt`, `status`),
    INDEX `Booking_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NULL,
    `action` ENUM('created', 'approved', 'rejected', 'moved', 'cancelled', 'edited', 'reminder_sent', 'custom_email_sent', 'series_removed') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `details` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingAuditLog_createdAt_idx`(`createdAt`),
    INDEX `BookingAuditLog_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `normalizedFullName` VARCHAR(191) NOT NULL DEFAULT '',
    `nameSearchTokens` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `normalizedEmail` VARCHAR(191) NOT NULL,
    `normalizedPhone` VARCHAR(191) NOT NULL,
    `skillLevel` ENUM('beginner', 'intermediate', 'advanced') NOT NULL DEFAULT 'beginner',
    `lessonMode` ENUM('in_person', 'video') NOT NULL DEFAULT 'in_person',
    `unitNumber` VARCHAR(191) NULL,
    `houseNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `streetName` VARCHAR(191) NOT NULL DEFAULT '',
    `streetType` VARCHAR(191) NOT NULL DEFAULT '',
    `suburb` VARCHAR(191) NOT NULL DEFAULT '',
    `state` VARCHAR(191) NOT NULL DEFAULT '',
    `postcode` VARCHAR(191) NOT NULL DEFAULT '',
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_isArchived_fullName_idx`(`isArchived`, `fullName`),
    INDEX `Customer_normalizedFullName_postcode_isArchived_idx`(`normalizedFullName`, `postcode`, `isArchived`),
    INDEX `Customer_normalizedEmail_idx`(`normalizedEmail`),
    INDEX `Customer_normalizedPhone_idx`(`normalizedPhone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerPortalCredential` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `passwordEncrypted` VARCHAR(191) NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rotatedAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CustomerPortalCredential_customerId_key`(`customerId`),
    INDEX `CustomerPortalCredential_isActive_generatedAt_idx`(`isActive`, `generatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerPortalCredentialAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NULL,
    `action` ENUM('generated', 'rotated', 'revealed') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `details` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerPortalCredentialAuditLog_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `CustomerPortalCredentialAuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningMaterial` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `materialType` ENUM('audio', 'pdf') NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LearningMaterial_storageKey_key`(`storageKey`),
    INDEX `LearningMaterial_customerId_bookingId_createdAt_idx`(`customerId`, `bookingId`, `createdAt`),
    INDEX `LearningMaterial_bookingId_createdAt_idx`(`bookingId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboundEmail` (
    `id` VARCHAR(191) NOT NULL,
    `toEmail` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `htmlBody` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('draft', 'sent', 'paid', 'void') NOT NULL DEFAULT 'draft',
    `documentType` ENUM('invoice', 'credit_note') NOT NULL DEFAULT 'invoice',
    `taxMode` ENUM('taxable', 'gst_free') NOT NULL DEFAULT 'taxable',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AUD',
    `customerId` VARCHAR(191) NULL,
    `bookingId` VARCHAR(191) NULL,
    `originalInvoiceId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerEmail` VARCHAR(191) NOT NULL,
    `customerPhone` VARCHAR(191) NOT NULL,
    `customerAddress` VARCHAR(191) NOT NULL,
    `sellerBusinessName` VARCHAR(191) NOT NULL,
    `sellerAbn` VARCHAR(191) NOT NULL,
    `sellerEmail` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `bankBsb` VARCHAR(191) NOT NULL,
    `bankAccountName` VARCHAR(191) NOT NULL,
    `bankAccountNumber` VARCHAR(191) NOT NULL,
    `subtotalCents` INTEGER NOT NULL,
    `gstCents` INTEGER NOT NULL,
    `totalCents` INTEGER NOT NULL,
    `notes` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `lastReminderSentAt` DATETIME(3) NULL,
    `lastReminderStage` INTEGER NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    INDEX `Invoice_status_isDeleted_dueAt_idx`(`status`, `isDeleted`, `dueAt`),
    INDEX `Invoice_documentType_createdAt_idx`(`documentType`, `createdAt`),
    INDEX `Invoice_originalInvoiceId_idx`(`originalInvoiceId`),
    INDEX `Invoice_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `Invoice_bookingId_createdAt_idx`(`bookingId`, `createdAt`),
    INDEX `Invoice_paidAt_idx`(`paidAt`),
    INDEX `Invoice_lastReminderStage_dueAt_idx`(`lastReminderStage`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceLineItem` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'custom',
    `description` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPriceCents` INTEGER NOT NULL,
    `taxMode` ENUM('taxable', 'gst_free') NOT NULL DEFAULT 'taxable',
    `lineSubtotalCents` INTEGER NOT NULL,
    `lineGstCents` INTEGER NOT NULL,
    `lineTotalCents` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InvoiceLineItem_invoiceId_sortOrder_idx`(`invoiceId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `action` ENUM('created', 'edited', 'sent', 'reminder_sent', 'marked_paid', 'marked_unpaid', 'credit_note_created', 'deleted', 'restored', 'voided') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `details` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InvoiceAuditLog_invoiceId_createdAt_idx`(`invoiceId`, `createdAt`),
    INDEX `InvoiceAuditLog_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingSeries` ADD CONSTRAINT `BookingSeries_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `BookingRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_seriesId_fkey` FOREIGN KEY (`seriesId`) REFERENCES `BookingSeries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_modifiedById_fkey` FOREIGN KEY (`modifiedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingAuditLog` ADD CONSTRAINT `BookingAuditLog_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingAuditLog` ADD CONSTRAINT `BookingAuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerPortalCredential` ADD CONSTRAINT `CustomerPortalCredential_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerPortalCredentialAuditLog` ADD CONSTRAINT `CustomerPortalCredentialAuditLog_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerPortalCredentialAuditLog` ADD CONSTRAINT `CustomerPortalCredentialAuditLog_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `CustomerPortalCredential`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerPortalCredentialAuditLog` ADD CONSTRAINT `CustomerPortalCredentialAuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningMaterial` ADD CONSTRAINT `LearningMaterial_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningMaterial` ADD CONSTRAINT `LearningMaterial_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningMaterial` ADD CONSTRAINT `LearningMaterial_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_originalInvoiceId_fkey` FOREIGN KEY (`originalInvoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceLineItem` ADD CONSTRAINT `InvoiceLineItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceAuditLog` ADD CONSTRAINT `InvoiceAuditLog_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceAuditLog` ADD CONSTRAINT `InvoiceAuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

