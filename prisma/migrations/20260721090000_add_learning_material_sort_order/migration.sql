-- Shared per-folder display order. No backfill: every existing row keeps 0, and
-- the `[sortOrder asc, createdAt desc, id asc]` read order over an all-zero table
-- is byte-for-byte today's `createdAt desc`, so this migration is a no-op until
-- someone drags. `LearningMaterial_customerId_folderId_createdAt_idx` is kept --
-- the admin list query has no folderId predicate and neither composite serves it.
ALTER TABLE `LearningMaterial` ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;
CREATE INDEX `LearningMaterial_customerId_folderId_sortOrder_idx`
  ON `LearningMaterial`(`customerId`,`folderId`,`sortOrder`);
