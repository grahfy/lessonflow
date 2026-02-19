import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Extracts the numeric sequence from invoice numbers like MGS-2026-0004.
 */
function extractSequence(invoiceNumber: string): number {
  const match = invoiceNumber.match(/-(\d+)$/);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1], 10) || 0;
}

/**
 * Returns invoice-number prefix from env, with an ASCII-safe fallback.
 */
function getInvoicePrefix(): string {
  const configured = process.env.INVOICE_NUMBER_PREFIX?.trim();
  if (!configured) {
    return "MGS";
  }
  return configured.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "MGS";
}

/**
 * Returns credit-note prefix and keeps it ASCII-safe for filesystem/email usage.
 */
function getCreditNotePrefix(): string {
  const configured = process.env.INVOICE_CREDIT_NOTE_PREFIX?.trim();
  if (configured) {
    return configured.replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "MGSCN";
  }
  return `${getInvoicePrefix()}CN`;
}

/**
 * Generates the next invoice number for the current year.
 *
 * This intentionally keeps logic deterministic and easy to inspect. A unique
 * constraint at the DB layer protects against accidental collisions.
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
      createdAt: "desc"
    },
    select: {
      invoiceNumber: true
    }
  });

  const nextSequence = extractSequence(latest?.invoiceNumber || "") + 1;
  return `${start}${String(nextSequence).padStart(4, "0")}`;
}

/**
 * Generates the next credit-note number for the current year.
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
