/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `OutboundEmail` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `OutboundEmail` ADD COLUMN `externalId` VARCHAR(191) NULL,
    ADD COLUMN `provider` VARCHAR(191) NOT NULL DEFAULT 'smtp',
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'app';

-- CreateIndex
CREATE UNIQUE INDEX `OutboundEmail_externalId_key` ON `OutboundEmail`(`externalId`);
