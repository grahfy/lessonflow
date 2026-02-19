-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'invoice';
ALTER TABLE "Invoice" ADD COLUMN "originalInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "lastReminderSentAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "lastReminderStage" INTEGER;

-- Recreate table to add self-referencing foreign key for credit-note linkage.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "documentType" TEXT NOT NULL DEFAULT 'invoice',
    "taxMode" TEXT NOT NULL DEFAULT 'taxable',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "customerId" TEXT,
    "bookingId" TEXT,
    "originalInvoiceId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerAddress" TEXT NOT NULL,
    "sellerBusinessName" TEXT NOT NULL,
    "sellerAbn" TEXT NOT NULL,
    "sellerEmail" TEXT,
    "bankName" TEXT NOT NULL,
    "bankBsb" TEXT NOT NULL,
    "bankAccountName" TEXT NOT NULL,
    "bankAccountNumber" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "gstCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "issuedAt" DATETIME NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "paidAt" DATETIME,
    "lastReminderSentAt" DATETIME,
    "lastReminderStage" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" (
  "id",
  "invoiceNumber",
  "status",
  "documentType",
  "taxMode",
  "currency",
  "customerId",
  "bookingId",
  "originalInvoiceId",
  "customerName",
  "customerEmail",
  "customerPhone",
  "customerAddress",
  "sellerBusinessName",
  "sellerAbn",
  "sellerEmail",
  "bankName",
  "bankBsb",
  "bankAccountName",
  "bankAccountNumber",
  "subtotalCents",
  "gstCents",
  "totalCents",
  "notes",
  "issuedAt",
  "dueAt",
  "sentAt",
  "paidAt",
  "lastReminderSentAt",
  "lastReminderStage",
  "isDeleted",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "invoiceNumber",
  "status",
  "documentType",
  "taxMode",
  "currency",
  "customerId",
  "bookingId",
  "originalInvoiceId",
  "customerName",
  "customerEmail",
  "customerPhone",
  "customerAddress",
  "sellerBusinessName",
  "sellerAbn",
  "sellerEmail",
  "bankName",
  "bankBsb",
  "bankAccountName",
  "bankAccountNumber",
  "subtotalCents",
  "gstCents",
  "totalCents",
  "notes",
  "issuedAt",
  "dueAt",
  "sentAt",
  "paidAt",
  "lastReminderSentAt",
  "lastReminderStage",
  "isDeleted",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt"
FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_status_isDeleted_dueAt_idx" ON "Invoice"("status", "isDeleted", "dueAt");
CREATE INDEX "Invoice_documentType_createdAt_idx" ON "Invoice"("documentType", "createdAt");
CREATE INDEX "Invoice_originalInvoiceId_idx" ON "Invoice"("originalInvoiceId");
CREATE INDEX "Invoice_customerId_createdAt_idx" ON "Invoice"("customerId", "createdAt");
CREATE INDEX "Invoice_bookingId_createdAt_idx" ON "Invoice"("bookingId", "createdAt");
CREATE INDEX "Invoice_paidAt_idx" ON "Invoice"("paidAt");
CREATE INDEX "Invoice_lastReminderStage_dueAt_idx" ON "Invoice"("lastReminderStage", "dueAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
