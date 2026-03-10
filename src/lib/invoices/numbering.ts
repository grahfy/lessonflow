/**
 * Sequential Document Numbering Service
 * 
 * Responsible for generating unique, chronological identifiers for Invoices 
 * and Credit Notes.
 * 
 * NUMBERING STRATEGY:
 * - Format: `{PREFIX}-{YEAR}-{SEQUENCE}` (e.g. MGS-2024-0042)
 * - Scope: Sequences reset according to the Issue Year. This prevents 
 *   numbers from becoming unwieldy over decades and improves auditability.
 * - Collisions: While we pre-calculate the "Next" number based on the `createdAt` 
 *   of the latest document, the Database maintains a `UNIQUE` constraint on 
 *   `invoiceNumber` as a final guard against race conditions.
 * 
 * RATIONALE: Many accounting systems require sequential numbering for tax 
 * compliance (GST/Australia). This module ensures those sequences are 
 * contiguous and non-overlapping.
 */

import { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Parses a document string to find the numeric end-piece.
 * Logic: Finds the portion after the final hyphen.
 */
function extractSequence(invoiceNumber: string): number {
  if (!invoiceNumber) return 0;
  
  const match = invoiceNumber.match(/-(\d+)$/);
  if (!match) return 0;
  
  return Number.parseInt(match[1], 10) || 0;
}

/**
 * Resolves the Invoice prefix from environment.
 * RATIONALE: Sanitized to Alphanumeric only to ensure compatibility 
 * with various PDF readers and email clients that may struggle with 
 * special characters in IDs.
 */
function getInvoicePrefix(): string {
  const configured = process.env.INVOICE_NUMBER_PREFIX?.trim();
  if (!configured) return "MGS";
  
  return configured.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "MGS";
}

/**
 * Resolves the Credit Note prefix.
 * Defaults to `${InvoicePrefix}CN` if not specified.
 */
function getCreditNotePrefix(): string {
  const configured = process.env.INVOICE_CREDIT_NOTE_PREFIX?.trim();
  if (configured) {
    return configured.replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "MGSCN";
  }
  return `${getInvoicePrefix()}CN`;
}

/**
 * Generates the next available Invoice number for the specified year.
 * 
 * LOGIC:
 * 1. Calculate standard prefix based on the `issuedAt` date.
 * 2. Find the most recently created document (by `createdAt`) with that prefix.
 * 3. Increment its trailing sequence by 1.
 * 4. Pad with zeros (to a length of 4) for consistent sorting and visual alignment.
 * 
 * @param prisma - Active DB client or transaction
 * @param issuedAt - Date the document is officially "dated"
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
      // NOTE: We order by createdAt to ensure we find the truly most recent 
      // entry, regardless of manual 'issuedAt' back-dating.
      createdAt: "desc" 
    },
    select: { invoiceNumber: true }
  });

  const nextSequence = extractSequence(latest?.invoiceNumber || "") + 1;
  return `${start}${String(nextSequence).padStart(4, "0")}`;
}

/**
 * Generates the next unique Credit Note number.
 * Mirrors the invoice logic but uses the Credit Note prefix and document type.
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
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true }
  });

  const nextSequence = extractSequence(latest?.invoiceNumber || "") + 1;
  return `${start}${String(nextSequence).padStart(4, "0")}`;
}
