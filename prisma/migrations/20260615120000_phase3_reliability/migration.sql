-- Phase 3 reliability foundation. Purely additive: one index, one nullable
-- boolean column with a default, and a DB-enforced single-pending guard on
-- BookingRescheduleRequest.

-- AlterTable: faster filtering of system logs by event name.
CREATE INDEX `SystemLog_event_idx` ON `SystemLog`(`event`);

-- AlterTable: owner error-alert toggle (defaults on).
ALTER TABLE `NotificationSettings`
    ADD COLUMN `errorAlertsEnabled` BOOLEAN NOT NULL DEFAULT true;

-- Enforce "at most one pending reschedule request per booking" at the DB level.
-- MariaDB has no partial indexes, and a generated column cannot reference a
-- foreign-key column (`bookingId`) directly (error 1901). So we add a STORED
-- generated flag derived only from `status` and put a composite UNIQUE index on
-- (bookingId, pendingFlag): pending rows get pendingFlag=1 -> (bookingId, 1) must
-- be unique (one pending per booking); resolved rows get pendingFlag=NULL ->
-- NULLs never collide, so any number of resolved rows per booking are allowed.
ALTER TABLE `BookingRescheduleRequest`
    ADD COLUMN `pendingFlag` TINYINT
        GENERATED ALWAYS AS (IF(`status` = 'pending', 1, NULL)) STORED;

-- CreateIndex
CREATE UNIQUE INDEX `BookingRescheduleRequest_bookingId_pendingFlag_key`
    ON `BookingRescheduleRequest`(`bookingId`, `pendingFlag`);
