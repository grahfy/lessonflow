-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "skillLevel" TEXT NOT NULL DEFAULT 'beginner',
    "lessonMode" TEXT NOT NULL DEFAULT 'in_person',
    "unitNumber" TEXT,
    "houseNumber" TEXT NOT NULL DEFAULT '',
    "streetName" TEXT NOT NULL DEFAULT '',
    "streetType" TEXT NOT NULL DEFAULT '',
    "suburb" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN "customerId" TEXT REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingSeries" ADD COLUMN "customerId" TEXT REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD COLUMN "customerId" TEXT REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Customer_isArchived_fullName_idx" ON "Customer"("isArchived", "fullName");
CREATE INDEX "Customer_normalizedEmail_idx" ON "Customer"("normalizedEmail");
CREATE INDEX "Customer_normalizedPhone_idx" ON "Customer"("normalizedPhone");
CREATE INDEX "BookingRequest_customerId_idx" ON "BookingRequest"("customerId");
CREATE INDEX "BookingSeries_customerId_idx" ON "BookingSeries"("customerId");
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");
