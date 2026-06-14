-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `paidVia` VARCHAR(191) NULL,
    ADD COLUMN `payToken` VARCHAR(191) NULL,
    ADD COLUMN `stripeCheckoutSessionId` VARCHAR(191) NULL,
    ADD COLUMN `stripePaymentIntentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `NotificationSettings` ADD COLUMN `autoCreateInvoiceOnApproval` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `Invoice_payToken_key` ON `Invoice`(`payToken`);
