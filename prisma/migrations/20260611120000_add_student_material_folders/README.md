# Deploy runbook — `20260611120000_add_student_material_folders`

This migration is a **two-artifact change** (Step Group D of
`.omc/plans/ralplan-folders-student-profiles.md`):

1. **Structural DDL** (`migration.sql`, this directory): adds the
   `StudentMaterialFolder` table, the `LearningMaterial.folderId` column, and
   their FKs/indexes. No data transform.
2. **Folder-per-lesson DATA backfill** (`scripts/backfill-material-folders.ts`):
   idempotent; creates one "Lessons" parent + one lesson folder per
   booking-with-materials per customer, and relinks those materials.

The DDL **must** run before the backfill. The backfill self-guards with
`assertMigrated` and aborts with a clear message if the DDL is not yet applied.

---

## Deploy order

1. **Apply the DDL.**
   ```bash
   npx prisma migrate deploy        # applies 20260611120000_add_student_material_folders
   npx prisma migrate status        # confirm in-sync
   ```
   **Interim state (acceptable graceful degradation):** after the DDL but
   before the backfill, every existing material has `folderId = NULL` and
   therefore appears at the **student root** in the tree views. Nothing is
   hidden or lost — the backfill only reorganizes.

2. **Dry-run review (no writes).**
   ```bash
   npx tsx scripts/backfill-material-folders.ts --dry-run
   ```
   Review the printed tallies: "Lessons" parents that would be created, lesson
   folders that would be created, materials that would be relinked vs. left at
   root, and the per-customer AC-15 reconciliation count.

3. **Verification gate (AC-15).** The dry-run reconciliation **must** pass for
   every customer (`reachable == preExisting`; script exits non-zero and prints
   `RECONCILIATION FAILED` otherwise). Do **not** proceed to a real run until
   the dry-run reports `AC-15 reconciliation PASSED for all customers`.
   The dry-run applies the same `folderId IS NULL` relink guard as the real run,
   so its tally matches the subsequent real run exactly.

4. **Real run.**
   ```bash
   npx tsx scripts/backfill-material-folders.ts
   ```

5. **Re-run reconciliation gate.** The real run performs the same AC-15
   reconciliation after writing and exits non-zero on failure. The migration is
   **not complete** until this passes. A second real run is also a safe
   integrity check: it must report **0 "Lessons" parents created, 0 lesson
   folders created, 0 materials relinked** (idempotency — the upsert hits the
   existing `(customerId, sourceBookingId)` and the `folderId IS NULL` guard
   matches no rows).

6. **Deploy the app** (admin folder UI + folder-aware student portal).

---

## Rollback

The down-migration drops the additive objects only — no material bytes are
touched (`storageKey` is never modified by this feature) and no
`LearningMaterial` rows are deleted. Materials simply revert to the flat list
keyed by `bookingId`.

**Capture a row-count snapshot before and after** so you can prove no rows were
lost:

```sql
-- BEFORE rollback
SELECT COUNT(*) AS materials_before FROM `LearningMaterial`;
SELECT COUNT(*) AS folders_before   FROM `StudentMaterialFolder`;
```

```sql
-- Rollback DDL (reverse order of migration.sql)
ALTER TABLE `LearningMaterial` DROP FOREIGN KEY `LearningMaterial_folderId_fkey`;
DROP INDEX `LearningMaterial_customerId_folderId_createdAt_idx` ON `LearningMaterial`;
ALTER TABLE `LearningMaterial` DROP COLUMN `folderId`;          -- drops folderId
DROP TABLE `StudentMaterialFolder`;                              -- drops table + sourceBookingId
```

```sql
-- AFTER rollback (materials_after must equal materials_before)
SELECT COUNT(*) AS materials_after FROM `LearningMaterial`;
```

`folders_before` is informational; all folder rows are expected to be gone after
the table drop. `materials_after` **must equal** `materials_before` — any
difference indicates an unexpected data loss and the rollback should be
investigated before declaring it complete.
