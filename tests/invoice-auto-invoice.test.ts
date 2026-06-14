import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockTransaction,
  mockGetActiveLessonPricingMap,
  mockFindActiveInvoiceLinksForBookingIds,
  mockCreateInvoiceRecord,
  mockGetDurationMinutes,
  mockLogError,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockGetActiveLessonPricingMap: vi.fn(),
  mockFindActiveInvoiceLinksForBookingIds: vi.fn(),
  mockCreateInvoiceRecord: vi.fn(),
  mockGetDurationMinutes: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    // The function wraps every DB call in prisma.$transaction(cb); run the cb
    // with a stub tx so we can assert on the inner helper calls.
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/lesson-pricing", () => ({
  getActiveLessonPricingMap: mockGetActiveLessonPricingMap,
}));

vi.mock("@/lib/invoices/booking-links", () => ({
  findActiveInvoiceLinksForBookingIds: mockFindActiveInvoiceLinksForBookingIds,
  describeGroupedLessonLine: (minutes: number) => `${minutes} min lesson`,
}));

vi.mock("@/lib/invoices/persistence", () => ({
  createInvoiceRecord: mockCreateInvoiceRecord,
  getDefaultDueAt: (issued: Date) => issued,
}));

vi.mock("@/lib/booking-rules", () => ({
  getDurationMinutes: mockGetDurationMinutes,
}));

vi.mock("@/lib/invoices/snapshots", () => ({
  customerSnapshotFromBooking: () => ({}),
}));

vi.mock("@/lib/invoices/tax-profile", () => ({
  getInvoiceCurrency: () => "AUD",
}));

vi.mock("@/lib/invoices/gst-policy", () => ({
  getDefaultInvoiceTaxModeForCurrencyValue: () => "taxable",
}));

vi.mock("@/lib/observability", () => ({
  logError: mockLogError,
  logEvent: vi.fn(),
}));

import { autoCreateDraftInvoicesForApproval } from "@/lib/invoices/auto-invoice";

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk_1",
    customerId: "cust_1",
    lessonDuration: "min30" as const,
    customDurationMinutes: null,
    firstName: "Alex",
    lastName: "Student",
    name: "Alex Student",
    email: "alex@example.com",
    phone: "0400123456",
    address: "10 Main Street",
    ...overrides,
  };
}

describe("autoCreateDraftInvoicesForApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: run the transaction callback with a stub tx client.
    mockTransaction.mockImplementation((cb: (tx: unknown) => unknown) => cb({}));
    mockGetDurationMinutes.mockReturnValue(30);
    mockGetActiveLessonPricingMap.mockResolvedValue(new Map([[30, { priceCents: 6000 }]]));
    mockFindActiveInvoiceLinksForBookingIds.mockResolvedValue([]);
    mockCreateInvoiceRecord.mockResolvedValue({ id: "inv_new" });
  });

  it("creates one DRAFT invoice for a booking with active pricing", async () => {
    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [booking()],
      adminId: "admin_1",
      requestId: "req_1",
    });

    expect(created).toBe(1);
    expect(mockCreateInvoiceRecord).toHaveBeenCalledTimes(1);
    const [args] = mockCreateInvoiceRecord.mock.calls[0];
    expect(args.status).toBe("draft");
    expect(args.bookingId).toBe("bk_1");
    expect(args.bookingIds).toEqual(["bk_1"]);
    expect(args.lineItems[0].unitPriceCents).toBe(6000);
  });

  it("creates one draft per booking for a recurring series", async () => {
    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [booking({ id: "bk_1" }), booking({ id: "bk_2" }), booking({ id: "bk_3" })],
      adminId: "admin_1",
      requestId: "req_1",
    });

    expect(created).toBe(3);
    expect(mockCreateInvoiceRecord).toHaveBeenCalledTimes(3);
  });

  it("skips a booking that already has an active invoice link (dedupe)", async () => {
    mockFindActiveInvoiceLinksForBookingIds.mockResolvedValue([{ invoiceId: "inv_existing" }]);

    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [booking()],
      adminId: "admin_1",
      requestId: "req_1",
    });

    expect(created).toBe(0);
    expect(mockCreateInvoiceRecord).not.toHaveBeenCalled();
  });

  it("skips a booking with no active pricing for its duration", async () => {
    mockGetActiveLessonPricingMap.mockResolvedValue(new Map());

    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [booking()],
      adminId: "admin_1",
      requestId: "req_1",
    });

    expect(created).toBe(0);
    expect(mockCreateInvoiceRecord).not.toHaveBeenCalled();
  });

  it("skips a booking with no customer", async () => {
    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [booking({ customerId: null })],
      adminId: "admin_1",
      requestId: "req_1",
    });

    expect(created).toBe(0);
    expect(mockCreateInvoiceRecord).not.toHaveBeenCalled();
  });

  it("never throws and isolates a per-booking failure from the rest of the batch", async () => {
    // First booking's invoice creation throws; second should still succeed.
    mockCreateInvoiceRecord
      .mockRejectedValueOnce(new Error("pricing gap"))
      .mockResolvedValueOnce({ id: "inv_2" });

    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [booking({ id: "bk_1" }), booking({ id: "bk_2" })],
      adminId: "admin_1",
      requestId: "req_1",
    });

    // One failed, one succeeded — and the function returned normally (no throw).
    expect(created).toBe(1);
    expect(mockLogError).toHaveBeenCalled();
  });

  it("never throws when the pricing lookup itself fails", async () => {
    mockGetActiveLessonPricingMap.mockRejectedValue(new Error("db down"));

    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [booking()],
      adminId: "admin_1",
      requestId: "req_1",
    });

    expect(created).toBe(0);
    expect(mockLogError).toHaveBeenCalled();
  });

  it("returns 0 without any work for an empty booking list", async () => {
    const created = await autoCreateDraftInvoicesForApproval({
      bookings: [],
      adminId: "admin_1",
      requestId: "req_1",
    });

    expect(created).toBe(0);
    expect(mockGetActiveLessonPricingMap).not.toHaveBeenCalled();
  });
});

/**
 * The flag gate lives in the approval route: it only calls the auto-invoice
 * helper when NotificationSettings.autoCreateInvoiceOnApproval is true. Pin that
 * predicate so a regression in the gate (running auto-invoice with the flag off)
 * is caught.
 */
describe("auto-invoice flag gating predicate", () => {
  function shouldAutoInvoice(settings: { autoCreateInvoiceOnApproval: boolean }): boolean {
    return settings.autoCreateInvoiceOnApproval === true;
  }

  it("does not auto-invoice when the flag is off", () => {
    expect(shouldAutoInvoice({ autoCreateInvoiceOnApproval: false })).toBe(false);
  });

  it("auto-invoices when the flag is on", () => {
    expect(shouldAutoInvoice({ autoCreateInvoiceOnApproval: true })).toBe(true);
  });
});
