-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "unitNumber" TEXT,
    "houseNumber" TEXT NOT NULL DEFAULT '',
    "streetName" TEXT NOT NULL DEFAULT '',
    "streetType" TEXT NOT NULL DEFAULT '',
    "suburb" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "lessonMode" TEXT NOT NULL,
    "skillLevel" TEXT NOT NULL,
    "lessonDuration" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cancelledAt" DATETIME,
    "requestId" TEXT,
    "seriesId" TEXT,
    "modifiedById" TEXT,
    CONSTRAINT "Booking_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BookingRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "BookingSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_modifiedById_fkey" FOREIGN KEY ("modifiedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("address", "cancelledAt", "createdAt", "email", "endAt", "id", "lessonDuration", "lessonMode", "modifiedById", "name", "notes", "phone", "requestId", "seriesId", "skillLevel", "startAt", "status", "timezone", "updatedAt") SELECT "address", "cancelledAt", "createdAt", "email", "endAt", "id", "lessonDuration", "lessonMode", "modifiedById", "name", "notes", "phone", "requestId", "seriesId", "skillLevel", "startAt", "status", "timezone", "updatedAt" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_startAt_status_idx" ON "Booking"("startAt", "status");
CREATE TABLE "new_BookingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "unitNumber" TEXT,
    "houseNumber" TEXT NOT NULL DEFAULT '',
    "streetName" TEXT NOT NULL DEFAULT '',
    "streetType" TEXT NOT NULL DEFAULT '',
    "suburb" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "lessonMode" TEXT NOT NULL,
    "skillLevel" TEXT NOT NULL,
    "lessonDuration" TEXT NOT NULL,
    "requestedStartAt" DATETIME NOT NULL,
    "notes" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceEndAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvedById" TEXT,
    CONSTRAINT "BookingRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BookingRequest" ("address", "approvedById", "createdAt", "email", "id", "isRecurring", "lessonDuration", "lessonMode", "name", "notes", "phone", "recurrenceEndAt", "requestedStartAt", "skillLevel", "status", "updatedAt") SELECT "address", "approvedById", "createdAt", "email", "id", "isRecurring", "lessonDuration", "lessonMode", "name", "notes", "phone", "recurrenceEndAt", "requestedStartAt", "skillLevel", "status", "updatedAt" FROM "BookingRequest";
DROP TABLE "BookingRequest";
ALTER TABLE "new_BookingRequest" RENAME TO "BookingRequest";
CREATE INDEX "BookingRequest_requestedStartAt_status_idx" ON "BookingRequest"("requestedStartAt", "status");
CREATE TABLE "new_BookingSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "unitNumber" TEXT,
    "houseNumber" TEXT NOT NULL DEFAULT '',
    "streetName" TEXT NOT NULL DEFAULT '',
    "streetType" TEXT NOT NULL DEFAULT '',
    "suburb" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "lessonMode" TEXT NOT NULL,
    "skillLevel" TEXT NOT NULL,
    "lessonDuration" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTimeLocal" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "recurrenceEndAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BookingSeries" ("address", "createdAt", "dayOfWeek", "email", "id", "isActive", "lessonDuration", "lessonMode", "name", "phone", "recurrenceEndAt", "skillLevel", "startDate", "startTimeLocal", "timezone", "updatedAt") SELECT "address", "createdAt", "dayOfWeek", "email", "id", "isActive", "lessonDuration", "lessonMode", "name", "phone", "recurrenceEndAt", "skillLevel", "startDate", "startTimeLocal", "timezone", "updatedAt" FROM "BookingSeries";
DROP TABLE "BookingSeries";
ALTER TABLE "new_BookingSeries" RENAME TO "BookingSeries";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
