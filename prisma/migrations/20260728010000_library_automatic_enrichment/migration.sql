-- Preserve all existing library/manual-tag behaviour while adding optional
-- enrichment provenance. Findings are append-only audit records; no migration
-- backfill is necessary because legacy rows are valid without enrichment.
ALTER TABLE `LibraryItem` ADD COLUMN `artist` VARCHAR(191) NULL;
CREATE INDEX `LibraryItem_artist_idx` ON `LibraryItem`(`artist`);

CREATE TABLE `LibraryEnrichmentRun` (
  `id` VARCHAR(191) NOT NULL,
  `libraryItemId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `LibraryEnrichmentRun_status_nextAttemptAt_idx` (`status`, `nextAttemptAt`),
  INDEX `LibraryEnrichmentRun_libraryItemId_createdAt_idx` (`libraryItemId`, `createdAt`),
  CONSTRAINT `LibraryEnrichmentRun_libraryItemId_fkey` FOREIGN KEY (`libraryItemId`) REFERENCES `LibraryItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LibraryEnrichmentFinding` (
  `id` VARCHAR(191) NOT NULL,
  `enrichmentRunId` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  `confidence` DOUBLE NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NULL,
  `sourceUrl` VARCHAR(1000) NULL,
  `evidence` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `LibraryEnrichmentFinding_enrichmentRunId_idx` (`enrichmentRunId`),
  INDEX `LibraryEnrichmentFinding_status_idx` (`status`),
  CONSTRAINT `LibraryEnrichmentFinding_enrichmentRunId_fkey` FOREIGN KEY (`enrichmentRunId`) REFERENCES `LibraryEnrichmentRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LibraryEnrichmentCache` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `cacheKey` VARCHAR(512) NOT NULL,
  `payload` JSON NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `LibraryEnrichmentCache_provider_cacheKey_key` (`provider`, `cacheKey`),
  INDEX `LibraryEnrichmentCache_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
