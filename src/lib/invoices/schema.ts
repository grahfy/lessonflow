import { z } from "zod";

/**
 * Supported tax modes for invoice lines and invoice-level defaults.
 */
export const invoiceTaxModeSchema = z.enum(["taxable", "gst_free"]);
export const invoiceDiscountKindSchema = z.enum(["amount", "percent"]);

/**
 * Supported lifecycle states for invoices.
 */
export const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void"]);
export const invoiceAgingBucketSchema = z.enum(["current", "overdue_1_30", "overdue_31_plus"]);
export const invoiceSortBySchema = z.enum([
  "invoice_number",
  "customer_last_name",
  "status",
  "total",
  "due_date"
]);
export const invoiceSortDirectionSchema = z.enum(["asc", "desc"]);

/**
 * Temporary catalog options requested for the initial invoicing rollout.
 */
export const invoiceLineItemKindSchema = z.enum([
  "lesson_fee",
  "educational_books",
  "digital_lessons",
  "custom"
]);

/**
 * Single invoice line-item payload schema.
 */
const optionalDiscountFieldShape = {
  discountKind: invoiceDiscountKindSchema.optional().nullable(),
  discountValue: z.number().int().optional().nullable()
} as const;

function validateOptionalDiscountFields(
  data: {
    discountKind?: "amount" | "percent" | null;
    discountValue?: number | null;
  },
  ctx: z.RefinementCtx
) {
  const hasKind = data.discountKind !== undefined && data.discountKind !== null;
  const hasValue = data.discountValue !== undefined && data.discountValue !== null;

  if (hasKind !== hasValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountKind"],
      message: "Discount kind and value must be provided together."
    });
    return;
  }

  if (!hasKind || !hasValue) {
    return;
  }

  if (data.discountKind === "amount" && (data.discountValue as number) > 50_000_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountValue"],
      message: "Amount discounts must be 50,000,000 cents or less."
    });
  }

  if (data.discountKind === "percent" && ((data.discountValue as number) < 1 || (data.discountValue as number) > 10_000)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountValue"],
      message: "Percent discounts must be between 0.01% and 100.00%."
    });
  }
}

export const invoiceLineItemInputSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(999),
    unitPriceCents: z.number().int().min(-50_000_000).max(50_000_000),
    taxMode: invoiceTaxModeSchema.default("taxable"),
    kind: invoiceLineItemKindSchema.default("custom"),
    sortOrder: z.number().int().min(0).max(9_999).default(0)
  })
  .extend(optionalDiscountFieldShape)
  .superRefine(validateOptionalDiscountFields);

/**
 * Invoice create payload that supports direct create from UI and booking-linked defaults.
 */
export const createInvoiceSchema = z
  .object({
    bookingId: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    customerFirstName: z.string().trim().min(1).max(60),
    customerLastName: z.string().trim().min(1).max(60),
    customerName: z.string().trim().min(2).max(140),
    customerEmail: z.string().trim().email().max(200),
    customerPhone: z.string().trim().min(6).max(40),
    customerAddress: z.string().trim().min(3).max(260),
    taxMode: invoiceTaxModeSchema.default("taxable"),
    notes: z.string().trim().max(2_000).optional(),
    issuedAt: z.string().datetime({ offset: true }).optional(),
    dueAt: z.string().datetime({ offset: true }),
    lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100)
  })
  .extend(optionalDiscountFieldShape)
  .superRefine(validateOptionalDiscountFields);

/**
 * Customer-scoped invoice create payload used by `/customers/:id/invoices`.
 * Supports optional booking linkage while deriving customer snapshot server-side.
 */
export const createCustomerInvoiceSchema = z
  .object({
    bookingId: z.string().trim().min(1).optional(),
    lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100),
    dueAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2_000).optional(),
    taxMode: invoiceTaxModeSchema.optional()
  })
  .extend(optionalDiscountFieldShape)
  .superRefine(validateOptionalDiscountFields);

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
  .extend(optionalDiscountFieldShape)
  .superRefine(validateOptionalDiscountFields)
  .superRefine((data, ctx) => {
    if (
      data.action === "edit" &&
      !data.lineItems &&
      !data.customerName &&
      !data.customerEmail &&
      !data.customerPhone &&
      !data.customerAddress &&
      !data.taxMode &&
      data.notes === undefined &&
      !data.dueAt &&
      data.discountKind === undefined &&
      data.discountValue === undefined
    ) {
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
  sortBy: invoiceSortBySchema.default("invoice_number"),
  sortDir: invoiceSortDirectionSchema.default("desc"),
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
export const createBookingInvoiceSchema = z
  .object({
    lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100),
    dueAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2_000).optional(),
    taxMode: invoiceTaxModeSchema.optional()
  })
  .extend(optionalDiscountFieldShape)
  .superRefine(validateOptionalDiscountFields);

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
  stage: z.number().int().min(1).max(365).optional()
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateCustomerInvoiceInput = z.infer<typeof createCustomerInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreateBookingInvoiceInput = z.infer<typeof createBookingInvoiceSchema>;
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;
export type SendInvoiceRemindersInput = z.infer<typeof sendInvoiceRemindersSchema>;
export type InvoiceSortBy = z.infer<typeof invoiceSortBySchema>;
export type InvoiceSortDirection = z.infer<typeof invoiceSortDirectionSchema>;
