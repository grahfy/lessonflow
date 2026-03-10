/**
 * Invoice Numbering Service
 * 
 * This module manages the generation of unique, sequential identifiers for 
 * invoices and credit notes. 
 * 
 * FORMAT: [PREFIX]-[YEAR]-[SEQUENCE] (e.g., MGS-2024-0001)
 * 
 * RATIONALE: We use a YEAR-based sequence to ensure that numbering stays 
 * organized and provides immediate context about when a document was issued.
 */

import { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Parses an existing invoice number to extract its trailing numeric sequence.
 * 
 * @param invoiceNumber - The full string (e.g. "MGS-2024-0042")
 * @returns The integer sequence (e.g. 42) or 0 if no match
 */
function extractSequence(invoiceNumber: string): number {
  const match = invoiceNumber.match(/-(\d+)$/);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1], 10) || 0;
}

/**
 * Retrieves the base prefix for invoices from environment variables.
 * 
 * NOTE: We strip non-alphanumeric characters to ensure the prefix is safe 
 * for use in filenames and email subjects.
 * 
 * @returns Cleaned prefix string
 */
function getInvoicePrefix(): string {
  const configured = process.env.INVOICE_NUMBER_PREFIX?.trim();
  if (!configured) {
    return "MGS";
  }
  return configured.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "MGS";
}

/**
 * Retrieves the base prefix for credit notes.
 * Defaults to [InvoicePrefix]CN if not explicitly set.
 * 
 * @returns Cleaned prefix string
 */
function getCreditNotePrefix(): string {
  const configured = process.env.INVOICE_CREDIT_NOTE_PREFIX?.trim();
  if (configured) {
    return configured.replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "MGSCN";
  }
  return `${getInvoicePrefix()}CN`;
}

/**
 * Calculates and returns the next available invoice number for a given issue year.
 * 
 * LOGIC:
 * 1. Find the most recently created invoice for the same year and prefix.
 * 2. Extract its sequence number.
 * 3. Increment by 1 and pad with leading zeros.
 * 
 * SECURITY: While this logic is deterministic, the database maintains a 
 * UNIQUE constraint on invoiceNumber to prevent race-condition collisions.
 * 
 * @param prisma - Prisma client or transaction for DB access
 * @param issuedAt - The intended date of issue (determines the year segment)
 * @returns Next unique invoice number
 */
export async function generateNextInvoiceNumber(prisma: PrismaClient | Prisma.TransactionClient, issuedAt: Date): Promise<string> {
  const prefix = getInvoicePrefix();
  const year = issuedAt.getUTCFullYear();
  const start = `${prefix}-${year}-`;

  const latest = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: { startsWith: start },
      documentType: "invoice"
    },
    orderBy: {
      createdAt: "desc" // NOTE: We use createdAt to find the "latest" to ensure sequence consistency
    },
    select: {
      invoiceNumber: true
    }
  });

  const nextSequence = extractSequence(latest?.invoiceNumber || "") + 1;
  return `${start}${String(nextSequence).padStart(4, "0")}`;
}

/**
 * Generates the next unique credit note number for a given year.
 * Mirrors the logic of generateNextInvoiceNumber but targets 'credit_note' types.
 * 
 * @param prisma - Prisma client or transaction for DB access
 * @param issuedAt - The intended date of issue
 * @returns Next unique credit note number
 */
export async function generateNextCreditNoteNumber(prisma: PrismaClient | Prisma.TransactionClient, issuedAt: Date): Promise<string> {
  const prefix = getCreditNotePrefix();
  const year = issuedAt.getUTCFullYear();
  const start = `${prefix}-${year}-`;

  const latest = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: { startsWith: start },
      documentType: "credit_note"
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      invoiceNumber: true
    }
  });

  const nextSequence = extractSequence(latest?.invoiceNumber || "") + 1;
  return `${start}${String(nextSequence).padStart(4, "0")}`;
}
