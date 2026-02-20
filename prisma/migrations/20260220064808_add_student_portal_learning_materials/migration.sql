-- CreateTable
CREATE TABLE "CustomerPortalCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerPortalCredential_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerPortalCredentialAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "credentialId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPortalCredentialAuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerPortalCredentialAuditLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "CustomerPortalCredential" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerPortalCredentialAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "title" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningMaterial_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningMaterial_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningMaterial_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "normalizedFullName" TEXT NOT NULL DEFAULT '',
    "nameSearchTokens" TEXT,
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
INSERT INTO "new_Customer" ("createdAt", "email", "fullName", "normalizedFullName", "nameSearchTokens", "houseNumber", "id", "isArchived", "lessonMode", "normalizedEmail", "normalizedPhone", "phone", "postcode", "skillLevel", "state", "streetName", "streetType", "suburb", "unitNumber", "updatedAt") SELECT "createdAt", "email", "fullName", lower(trim("fullName")), lower(trim("fullName")), "houseNumber", "id", "isArchived", "lessonMode", "normalizedEmail", "normalizedPhone", "phone", "postcode", "skillLevel", "state", "streetName", "streetType", "suburb", "unitNumber", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE INDEX "Customer_isArchived_fullName_idx" ON "Customer"("isArchived", "fullName");
CREATE INDEX "Customer_normalizedFullName_postcode_isArchived_idx" ON "Customer"("normalizedFullName", "postcode", "isArchived");
CREATE INDEX "Customer_normalizedEmail_idx" ON "Customer"("normalizedEmail");
CREATE INDEX "Customer_normalizedPhone_idx" ON "Customer"("normalizedPhone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalCredential_customerId_key" ON "CustomerPortalCredential"("customerId");

-- CreateIndex
CREATE INDEX "CustomerPortalCredential_isActive_generatedAt_idx" ON "CustomerPortalCredential"("isActive", "generatedAt");

-- CreateIndex
CREATE INDEX "CustomerPortalCredentialAuditLog_customerId_createdAt_idx" ON "CustomerPortalCredentialAuditLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerPortalCredentialAuditLog_actorId_createdAt_idx" ON "CustomerPortalCredentialAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningMaterial_storageKey_key" ON "LearningMaterial"("storageKey");

-- CreateIndex
CREATE INDEX "LearningMaterial_customerId_bookingId_createdAt_idx" ON "LearningMaterial"("customerId", "bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningMaterial_bookingId_createdAt_idx" ON "LearningMaterial"("bookingId", "createdAt");
