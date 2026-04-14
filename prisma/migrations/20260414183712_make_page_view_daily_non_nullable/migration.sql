/*
  Warnings:

  - Made the column `referrer` on table `PageViewDaily` required. This step will fail if there are existing NULL values in that column.
  - Made the column `country` on table `PageViewDaily` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `PageViewDaily` MODIFY `referrer` VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY `country` VARCHAR(191) NOT NULL DEFAULT '';
