-- Placement columns so assigned library items live in the student's folder tree
-- alongside per-customer materials, sharing one order behind `lib:` tree ids.
-- No backfill: folderId NULL = root, which is where the separate
-- "Assigned by teacher" list already effectively sat. Nothing is dropped and no
-- blob/ownership column is touched.
ALTER TABLE `LibraryAssignment` ADD COLUMN `folderId` VARCHAR(191) NULL;
ALTER TABLE `LibraryAssignment` ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

-- SET NULL, not CASCADE: deleting a folder must never delete the assignment.
-- The folder DELETE route relocates rows to the parent inside its own
-- transaction; this FK is only the backstop for paths that do not.
ALTER TABLE `LibraryAssignment`
  ADD CONSTRAINT `LibraryAssignment_folderId_fkey`
  FOREIGN KEY (`folderId`) REFERENCES `StudentMaterialFolder`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `LibraryAssignment_customerId_folderId_sortOrder_idx`
  ON `LibraryAssignment`(`customerId`,`folderId`,`sortOrder`);
