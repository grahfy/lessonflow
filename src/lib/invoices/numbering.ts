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
 * Detects a Prisma UNIQUE-constraint violation (P2002) on the `invoiceNumber`
 * column.
 *
 * RATIONALE: Document numbers are derived from the latest existing row, so two
 * concurrent creates can compute the same sequence and collide on the DB UNIQUE
 * constraint. Callers use this guard to distinguish that recoverable collision
 * (safe to retry with a freshly recomputed number) from any other failure.
 */
export function isInvoiceNumberConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  // The `target` meta lists the offending field(s). When the driver omits it we
  // conservatively treat any invoice-table P2002 as an invoice-number collision,
  // since `invoiceNumber` is the only UNIQUE constraint we allocate by hand.
  const target = error.meta?.target;
  if (target === undefined) {
    return true;
  }
  if (typeof target === "string") {
    return target.toLowerCase().includes("invoicenumber");
  }
  if (Array.isArray(target)) {
    return target.some((field) => String(field).toLowerCase().includes("invoicenumber"));
  }
  return false;
}

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
 * Generates the next available document number for the given prefix/year/type.
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
async function generateNextDocumentNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  issuedAt: Date,
  prefix: string,
  documentType: "invoice" | "credit_note"
): Promise<string> {
  const year = issuedAt.getUTCFullYear();
  const start = `${prefix}-${year}-`;

  const latest = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: { startsWith: start },
      documentType
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
 * Generates the next available Invoice number for the specified year.
 */
export async function generateNextInvoiceNumber(prisma: PrismaClient | Prisma.TransactionClient, issuedAt: Date): Promise<string> {
  return generateNextDocumentNumber(prisma, issuedAt, getInvoicePrefix(), "invoice");
}

/**
 * Generates the next unique Credit Note number.
 * Mirrors the invoice logic but uses the Credit Note prefix and document type.
 */
export async function generateNextCreditNoteNumber(prisma: PrismaClient | Prisma.TransactionClient, issuedAt: Date): Promise<string> {
  return generateNextDocumentNumber(prisma, issuedAt, getCreditNotePrefix(), "credit_note");
}
