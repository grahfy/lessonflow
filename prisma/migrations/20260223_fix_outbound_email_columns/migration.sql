-- AlterTable: Change htmlBody and error columns to TEXT to support longer email content
-- This fixes the "provided value for the column is too long" error for email HTML bodies

ALTER TABLE `OutboundEmail` MODIFY COLUMN `htmlBody` TEXT NOT NULL;
ALTER TABLE `OutboundEmail` MODIFY COLUMN `error` TEXT NULL;
