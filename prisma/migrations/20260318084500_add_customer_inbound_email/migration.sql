-- CreateTable
CREATE TABLE `CustomerInboundEmail` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'imap',
    `source` VARCHAR(191) NOT NULL DEFAULT 'imap',
    `externalId` VARCHAR(191) NOT NULL,
    `fromEmail` VARCHAR(191) NOT NULL,
    `toEmail` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `snippet` TEXT NOT NULL,
    `bodyText` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'received',
    `receivedAt` DATETIME(3) NOT NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CustomerInboundEmail_provider_externalId_key`(`provider`, `externalId`),
    INDEX `CustomerInboundEmail_customerId_receivedAt_idx`(`customerId`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomerInboundEmail` ADD CONSTRAINT `CustomerInboundEmail_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
