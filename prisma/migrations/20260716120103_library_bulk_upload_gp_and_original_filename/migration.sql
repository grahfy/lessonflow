-- Widen the shared LearningMaterialType enum with `guitar_pro` (appended last —
-- a MySQL enum append is metadata-only and never rewrites rows) and add the
-- nullable LibraryItem.originalFilename used for duplicate detection and
-- download-filename fidelity. No backfill: original names were never captured
-- for existing rows (they dedupe via the legacy title fallback instead).

-- AlterTable
ALTER TABLE `LearningMaterial` MODIFY `materialType` ENUM('audio', 'pdf', 'image', 'guitar_pro') NOT NULL;

-- AlterTable
ALTER TABLE `LibraryItem` ADD COLUMN `originalFilename` VARCHAR(255) NULL,
    MODIFY `materialType` ENUM('audio', 'pdf', 'image', 'guitar_pro') NOT NULL;

-- CreateIndex
CREATE INDEX `LibraryItem_originalFilename_idx` ON `LibraryItem`(`originalFilename`);
