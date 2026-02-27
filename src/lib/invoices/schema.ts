import { z } from "zod";

/**
 * Supported tax modes for invoice lines and invoice-level defaults.
 */
export const invoiceTaxModeSchema = z.enum(["taxable", "gst_free"]);

/**
 * Supported lifecycle states for invoices.
 */
export const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void"]);
export const invoiceAgingBucketSchema = z.enum(["current", "overdue_1_30", "overdue_31_plus"]);

/**
 * Temporary catalog options requested for the initial invoicing rollout.
 */
export const invoiceLineItemKindSchema = z.enum([
  "lesson_fee",
  "educational_books",
  "digital_guitar_lessons",
  "custom"
]);

/**
 * Single invoice line-item payload schema.
 */
export const invoiceLineItemInputSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(999),
  unitPriceCents: z.number().int().min(0).max(50_000_000),
  taxMode: invoiceTaxModeSchema.default("taxable"),
  kind: invoiceLineItemKindSchema.default("custom"),
  sortOrder: z.number().int().min(0).max(9_999).default(0)
});

/**
 * Invoice create payload that supports direct create from UI and booking-linked defaults.
 */
export const createInvoiceSchema = z.object({
  bookingId: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  customerName: z.string().trim().min(2).max(140),
  customerEmail: z.string().trim().email().max(200),
  customerPhone: z.string().trim().min(6).max(40),
  customerAddress: z.string().trim().min(3).max(260),
  taxMode: invoiceTaxModeSchema.default("taxable"),
  notes: z.string().trim().max(2_000).optional(),
  issuedAt: z.string().datetime({ offset: true }).optional(),
  dueAt: z.string().datetime({ offset: true }),
  lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100)
});

/**
 * Customer-scoped invoice create payload used by `/customers/:id/invoices`.
 * Supports optional booking linkage while deriving customer snapshot server-side.
 */
export const createCustomerInvoiceSchema = z.object({
  bookingId: z.string().trim().min(1).optional(),
  lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100),
  dueAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2_000).optional(),
  taxMode: invoiceTaxModeSchema.optional()
});

/**
 * Invoice update payload for editing draft/sent invoices and toggling payment state.
 */
export const updateInvoiceSchema = z
  .object({
    action: z.enum(["edit", "mark_paid", "mark_unpaid", "void", "restore"]),
    customerName: z.string().trim().min(2).max(140).optional(),
    customerEmail: z.string().trim().email().max(200).optional(),
    customerPhone: z.string().trim().min(6).max(40).optional(),
    customerAddress: z.string().trim().min(3).max(260).optional(),
    taxMode: invoiceTaxModeSchema.optional(),
    notes: z.string().trim().max(2_000).optional().nullable(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100).optional()
  })
  .superRefine((data, ctx) => {
    if (data.action === "edit" && !data.lineItems && !data.customerName && !data.customerEmail && !data.customerPhone && !data.customerAddress && !data.taxMode && data.notes === undefined && !data.dueAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["action"],
        message: "Edit action requires at least one updated field."
      });
    }
  });

/**
 * Query schema for listing invoices with pagination/search filters.
 */
export const listInvoicesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: invoiceStatusSchema.optional(),
  agingBucket: invoiceAgingBucketSchema.optional(),
  customerId: z.string().trim().min(1).optional(),
  outstanding: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

/**
 * Booking-linked invoice creation schema used by the booking dialog action.
 */
export const createBookingInvoiceSchema = z.object({
  lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100),
  dueAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2_000).optional(),
  taxMode: invoiceTaxModeSchema.optional()
});

/**
 * Credit-note creation payload for reversing a sent/paid invoice.
 */
export const createCreditNoteSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

/**
 * Batch reminder payload used by admin reminder actions.
 */
export const sendInvoiceRemindersSchema = z.object({
  dryRun: z.boolean().optional(),
  maxInvoices: z.number().int().min(1).max(500).optional(),
  customerId: z.string().trim().min(1).optional(),
  stage: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional()
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateCustomerInvoiceInput = z.infer<typeof createCustomerInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreateBookingInvoiceInput = z.infer<typeof createBookingInvoiceSchema>;
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;
export type SendInvoiceRemindersInput = z.infer<typeof sendInvoiceRemindersSchema>;
