-- AlterTable
ALTER TABLE `AdminUser` MODIFY `instruments` TEXT NULL,
    MODIFY `specialisations` TEXT NULL,
    MODIFY `background` TEXT NULL,
    MODIFY `musicalHistory` TEXT NULL;

-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `discountCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `discountKind` ENUM('amount', 'percent') NULL,
    ADD COLUMN `discountValue` INTEGER NULL;

-- AlterTable
ALTER TABLE `InvoiceLineItem` ADD COLUMN `discountKind` ENUM('amount', 'percent') NULL,
    ADD COLUMN `discountValue` INTEGER NULL,
    ADD COLUMN `lineDiscountCents` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `InvoiceProductPreset` ADD COLUMN `discountKind` ENUM('amount', 'percent') NULL,
    ADD COLUMN `discountValue` INTEGER NULL;
