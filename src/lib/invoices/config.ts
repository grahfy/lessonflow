import { prisma } from "@/lib/db";
import { InvoiceTemplate } from "@/generated/prisma/client";

/**
 * Fetches the active invoice template configuration from the database.
 * Returns null if no template is configured, in which case fallbacks should be used.
 */
export async function getDefaultInvoiceTemplate(): Promise<InvoiceTemplate | null> {
  return prisma.invoiceTemplate.findFirst({
    where: { isDefault: true }
  });
}
