-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `lessonCreditBatchId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `InvoiceLineItem` ADD COLUMN `packageId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `LessonPackage` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `lessonCount` INTEGER NOT NULL,
    `durationMinutes` INTEGER NULL,
    `priceCents` INTEGER NOT NULL,
    `validityDays` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LessonPackage_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonCreditBatch` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `durationMinutes` INTEGER NULL,
    `initialQuantity` INTEGER NOT NULL,
    `remainingQuantity` INTEGER NOT NULL,
    `source` ENUM('package_purchase', 'admin_grant', 'voucher_grant') NOT NULL,
    `sourceInvoiceId` VARCHAR(191) NULL,
    `packageId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LessonCreditBatch_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Voucher` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `valueCents` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AUD',
    `status` ENUM('pending', 'active', 'redeemed', 'void') NOT NULL DEFAULT 'pending',
    `purchaserName` VARCHAR(191) NULL,
    `purchaserEmail` VARCHAR(191) NULL,
    `recipientName` VARCHAR(191) NULL,
    `recipientEmail` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `issuedById` VARCHAR(191) NULL,
    `stripeCheckoutSessionId` VARCHAR(191) NULL,
    `stripePaymentIntentId` VARCHAR(191) NULL,
    `paidVia` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `redeemedAt` DATETIME(3) NULL,
    `redeemedByCustomerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Voucher_code_key`(`code`),
    INDEX `Voucher_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerCreditLedger` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `balanceAfterCents` INTEGER NOT NULL,
    `reason` ENUM('voucher_redemption', 'invoice_application', 'admin_adjustment', 'refund') NOT NULL,
    `sourceVoucherId` VARCHAR(191) NULL,
    `sourceInvoiceId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerCreditLedger_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_lessonCreditBatchId_fkey` FOREIGN KEY (`lessonCreditBatchId`) REFERENCES `LessonCreditBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceLineItem` ADD CONSTRAINT `InvoiceLineItem_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `LessonPackage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonCreditBatch` ADD CONSTRAINT `LessonCreditBatch_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonCreditBatch` ADD CONSTRAINT `LessonCreditBatch_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `LessonPackage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerCreditLedger` ADD CONSTRAINT `CustomerCreditLedger_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
