/**
 * DB-backed integration tests for the auto-invoicing feature (roadmap #8).
 *
 * Unlike tests/invoice-auto-invoice.test.ts (fully mocked unit tests), this
 * suite drives REAL prisma against the test DB so we exercise the actual
 * createInvoiceRecord/findActiveInvoiceLinksForBookingIds/lesson-pricing wiring.
 *
 * Coverage:
 *  1. autoCreateDraftInvoicesForApproval — draft creation, recurring series,
 *     dedupe via existing active link, skip on missing pricing / missing
 *     customer, and per-booking failure isolation (never throws).
 *  2. NotificationSettings.autoCreateInvoiceOnApproval roundtrip through the
 *     same save/serialize contract the settings route uses.
 *  3. The "unbilled" derivation that the bookings calendar payload performs:
 *     findActiveInvoiceLinksForBookingIds -> hasActiveInvoice per booking id.
 *
 * All seed data uses an `autoinv_test_` id/email prefix so it never collides
 * with the parallel payments integration suite, and every inserted row is
 * removed in afterEach/afterAll so reruns are deterministic.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { autoCreateDraftInvoicesForApproval } from "@/lib/invoices/auto-invoice";
import { findActiveInvoiceLinksForBookingIds } from "@/lib/invoices/booking-links";
import {
  DEFAULT_NOTIFICATION_SETTINGS_ID,
  getNotificationSettingsState,
  saveNotificationSettings
} from "@/lib/email/notification-settings";
import { DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES } from "@/lib/email/notification-settings-contract";

const PREFIX = "autoinv_test_";

// 30 and 60 minute prices in cents; distinct values so we can assert the
// unitPriceCents copied onto the draft came from the matching pricing row.
const PRICE_30_CENTS = 4321;
const PRICE_60_CENTS = 8642;

const ADMIN_ID = `${PREFIX}admin`;

type SeededBookingInput = {
  id: string;
  customerId: string | null;
  lessonDuration: "min30" | "min60";
  customDurationMinutes?: number | null;
};

/** Build the AutoInvoiceBooking shape the helper accepts from a seeded id. */
function autoInvoiceBookingArg(input: SeededBookingInput) {
  return {
    id: input.id,
    customerId: input.customerId,
    lessonDuration: input.lessonDuration,
    customDurationMinutes: input.customDurationMinutes ?? null,
    firstName: "Auto",
    lastName: "Invoice",
    name: "Auto Invoice",
    email: `${input.id}@example.com`,
    phone: "0400000000",
    address: "1 Test Street"
  };
}

async function seedAdmin() {
  await prisma.adminUser.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: `${PREFIX}admin@example.com`,
      displayName: "Auto Invoice Admin",
      passwordHash: "x"
    }
  });
}

async function seedCustomer(id: string) {
  await prisma.customer.create({
    data: {
      id,
      fullName: "Auto Invoice Customer",
      email: `${id}@example.com`,
      phone: "0400000000",
      normalizedEmail: `${id}@example.com`,
      normalizedPhone: "0400000000"
    }
  });
}

async function seedBooking(input: SeededBookingInput) {
  const now = new Date();
  await prisma.booking.create({
    data: {
      id: input.id,
      status: "approved",
      firstName: "Auto",
      lastName: "Invoice",
      name: "Auto Invoice",
      email: `${input.id}@example.com`,
      phone: "0400000000",
      address: "1 Test Street",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: input.lessonDuration,
      customDurationMinutes: input.customDurationMinutes ?? null,
      startAt: now,
      endAt: new Date(now.getTime() + 30 * 60 * 1000),
      timezone: "Australia/Melbourne",
      customerId: input.customerId
    }
  });
}

async function seedActivePricing() {
  await prisma.lessonPricingOption.createMany({
    data: [
      { durationMinutes: 30, priceCents: PRICE_30_CENTS, isActive: true, sortOrder: 0 },
      { durationMinutes: 60, priceCents: PRICE_60_CENTS, isActive: true, sortOrder: 1 }
    ]
  });
}

/** Count DRAFT invoices linked to a booking id via the booking-link table. */
async function draftInvoicesForBooking(bookingId: string) {
  return prisma.invoice.findMany({
    where: {
      bookingLinks: { some: { bookingId } }
    },
    include: { lineItems: true, bookingLinks: true }
  });
}

/**
 * Remove every row this suite could have created, in FK-safe order. Invoices
 * cascade their line items / booking links, so deleting invoices first clears
 * those; then booking links, bookings, pricing, customers, admin, settings.
 */
async function cleanup() {
  await prisma.invoice.deleteMany({
    where: { createdById: ADMIN_ID }
  });
  // Belt-and-suspenders: any links/invoices tied to our prefixed bookings.
  await prisma.invoiceBookingLink.deleteMany({
    where: { bookingId: { startsWith: PREFIX } }
  });
  await prisma.invoice.deleteMany({
    where: { customerId: { startsWith: PREFIX } }
  });
  await prisma.booking.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.lessonPricingOption.deleteMany({
    where: { durationMinutes: { in: [30, 60] } }
  });
  await prisma.customer.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { id: ADMIN_ID } });
}

describe("auto-invoicing (DB-backed)", () => {
  beforeEach(async () => {
    await cleanup();
    await seedAdmin();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    // Restore the notification settings singleton to a clean default so the
    // roundtrip tests below don't leak state into other suites.
    await prisma.notificationSettings.deleteMany({
      where: { id: DEFAULT_NOTIFICATION_SETTINGS_ID }
    });
    await prisma.$disconnect();
  });

  describe("autoCreateDraftInvoicesForApproval", () => {
    it("creates one DRAFT invoice with unitPriceCents from pricing for a single booking", async () => {
      await seedActivePricing();
      await seedCustomer(`${PREFIX}cust1`);
      await seedBooking({ id: `${PREFIX}bk1`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" });

      const created = await autoCreateDraftInvoicesForApproval({
        bookings: [autoInvoiceBookingArg({ id: `${PREFIX}bk1`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" })],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req1`
      });

      expect(created).toBe(1);

      const invoices = await draftInvoicesForBooking(`${PREFIX}bk1`);
      expect(invoices).toHaveLength(1);
      const invoice = invoices[0];
      expect(invoice.status).toBe("draft");
      expect(invoice.bookingLinks).toHaveLength(1);
      expect(invoice.bookingLinks[0].bookingId).toBe(`${PREFIX}bk1`);
      // Single lesson_fee line at the 30-minute price.
      expect(invoice.lineItems).toHaveLength(1);
      expect(invoice.lineItems[0].unitPriceCents).toBe(PRICE_30_CENTS);
      expect(invoice.lineItems[0].quantity).toBe(1);
    });

    it("creates one draft per booking for a 3-booking recurring series", async () => {
      await seedActivePricing();
      await seedCustomer(`${PREFIX}cust1`);
      const ids = [`${PREFIX}bkA`, `${PREFIX}bkB`, `${PREFIX}bkC`];
      for (const id of ids) {
        await seedBooking({ id, customerId: `${PREFIX}cust1`, lessonDuration: "min60" });
      }

      const created = await autoCreateDraftInvoicesForApproval({
        bookings: ids.map((id) =>
          autoInvoiceBookingArg({ id, customerId: `${PREFIX}cust1`, lessonDuration: "min60" })
        ),
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req_series`
      });

      expect(created).toBe(3);
      for (const id of ids) {
        const invoices = await draftInvoicesForBooking(id);
        expect(invoices).toHaveLength(1);
        expect(invoices[0].lineItems[0].unitPriceCents).toBe(PRICE_60_CENTS);
      }
    });

    it("skips a booking that already has an active invoice link (dedupe)", async () => {
      await seedActivePricing();
      await seedCustomer(`${PREFIX}cust1`);
      await seedBooking({ id: `${PREFIX}bk1`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" });

      // First pass creates the draft + active link.
      const first = await autoCreateDraftInvoicesForApproval({
        bookings: [autoInvoiceBookingArg({ id: `${PREFIX}bk1`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" })],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req1`
      });
      expect(first).toBe(1);

      // Second pass must dedupe: no new draft because an active link exists.
      const second = await autoCreateDraftInvoicesForApproval({
        bookings: [autoInvoiceBookingArg({ id: `${PREFIX}bk1`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" })],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req2`
      });
      expect(second).toBe(0);

      const invoices = await draftInvoicesForBooking(`${PREFIX}bk1`);
      expect(invoices).toHaveLength(1);
    });

    it("skips a booking whose duration has no configured active pricing", async () => {
      // No pricing seeded at all -> getActiveLessonPricingMap is empty.
      await seedCustomer(`${PREFIX}cust1`);
      await seedBooking({ id: `${PREFIX}bk1`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" });

      const created = await autoCreateDraftInvoicesForApproval({
        bookings: [autoInvoiceBookingArg({ id: `${PREFIX}bk1`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" })],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req1`
      });

      expect(created).toBe(0);
      expect(await draftInvoicesForBooking(`${PREFIX}bk1`)).toHaveLength(0);
    });

    it("skips a booking with no customer", async () => {
      await seedActivePricing();
      await seedBooking({ id: `${PREFIX}bk1`, customerId: null, lessonDuration: "min30" });

      const created = await autoCreateDraftInvoicesForApproval({
        bookings: [autoInvoiceBookingArg({ id: `${PREFIX}bk1`, customerId: null, lessonDuration: "min30" })],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req1`
      });

      expect(created).toBe(0);
      expect(await draftInvoicesForBooking(`${PREFIX}bk1`)).toHaveLength(0);
    });

    it("never throws and isolates a per-booking failure (bad customerId FK) from the rest", async () => {
      await seedActivePricing();
      await seedCustomer(`${PREFIX}cust1`);
      await seedBooking({ id: `${PREFIX}bkGood`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" });

      // The "bad" booking references a customerId that does not exist in the DB.
      // It passes the null/pricing guards but createInvoiceRecord's FK insert
      // fails — that error must be isolated so the good booking still bills.
      const created = await autoCreateDraftInvoicesForApproval({
        bookings: [
          autoInvoiceBookingArg({
            id: `${PREFIX}bkBad`,
            customerId: `${PREFIX}missing_customer`,
            lessonDuration: "min30"
          }),
          autoInvoiceBookingArg({ id: `${PREFIX}bkGood`, customerId: `${PREFIX}cust1`, lessonDuration: "min30" })
        ],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req_iso`
      });

      // Exactly one succeeded; the function returned normally (no throw).
      expect(created).toBe(1);
      expect(await draftInvoicesForBooking(`${PREFIX}bkGood`)).toHaveLength(1);
      expect(await draftInvoicesForBooking(`${PREFIX}bkBad`)).toHaveLength(0);
    });
  });

  describe("NotificationSettings.autoCreateInvoiceOnApproval roundtrip", () => {
    const baseInput = {
      globalAutomatedEmailEnabled: true,
      categoryPreferences: { ...DEFAULT_NOTIFICATION_CATEGORY_PREFERENCES },
      automaticInvoiceRemindersEnabled: true,
      invoiceReminderFirstDelayDays: 7,
      invoiceReminderResendIntervalDays: 7,
      lessonReminderEnabled: false,
      lessonReminderHoursBefore: 24
    };

    it("persists and reads back autoCreateInvoiceOnApproval=true", async () => {
      await saveNotificationSettings({ ...baseInput, autoCreateInvoiceOnApproval: true });
      const state = await getNotificationSettingsState();
      expect(state.autoCreateInvoiceOnApproval).toBe(true);
    });

    it("persists and reads back autoCreateInvoiceOnApproval=false", async () => {
      await saveNotificationSettings({ ...baseInput, autoCreateInvoiceOnApproval: false });
      const state = await getNotificationSettingsState();
      expect(state.autoCreateInvoiceOnApproval).toBe(false);
    });
  });

  describe("unbilled derivation (calendar payload hasActiveInvoice)", () => {
    it("sets hasActiveInvoice true only for bookings with an active invoice link", async () => {
      await seedActivePricing();
      await seedCustomer(`${PREFIX}cust1`);
      const billedId = `${PREFIX}bkBilled`;
      const unbilledId = `${PREFIX}bkUnbilled`;
      await seedBooking({ id: billedId, customerId: `${PREFIX}cust1`, lessonDuration: "min30" });
      await seedBooking({ id: unbilledId, customerId: `${PREFIX}cust1`, lessonDuration: "min30" });

      // Bill only the first booking.
      await autoCreateDraftInvoicesForApproval({
        bookings: [autoInvoiceBookingArg({ id: billedId, customerId: `${PREFIX}cust1`, lessonDuration: "min30" })],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req_unbilled`
      });

      // Mirror the calendar route's derivation (src/app/api/admin/bookings/route.ts).
      const bookingIds = [billedId, unbilledId];
      const activeInvoiceLinks = await prisma.$transaction((tx) =>
        findActiveInvoiceLinksForBookingIds(tx, bookingIds)
      );
      const billedBookingIds = new Set(activeInvoiceLinks.map((link) => link.bookingId));

      expect(billedBookingIds.has(billedId)).toBe(true);
      expect(billedBookingIds.has(unbilledId)).toBe(false);
    });

    it("treats a voided invoice link as unbilled", async () => {
      await seedActivePricing();
      await seedCustomer(`${PREFIX}cust1`);
      const bookingId = `${PREFIX}bkVoid`;
      await seedBooking({ id: bookingId, customerId: `${PREFIX}cust1`, lessonDuration: "min30" });

      await autoCreateDraftInvoicesForApproval({
        bookings: [autoInvoiceBookingArg({ id: bookingId, customerId: `${PREFIX}cust1`, lessonDuration: "min30" })],
        adminId: ADMIN_ID,
        requestId: `${PREFIX}req_void`
      });

      // Void the draft we just created; findActiveInvoiceLinksForBookingIds
      // excludes status=void, so the booking should read back as unbilled.
      const invoices = await draftInvoicesForBooking(bookingId);
      expect(invoices).toHaveLength(1);
      await prisma.invoice.update({
        where: { id: invoices[0].id },
        data: { status: "void" }
      });

      const links = await prisma.$transaction((tx) =>
        findActiveInvoiceLinksForBookingIds(tx, [bookingId])
      );
      const billed = new Set(links.map((link) => link.bookingId));
      expect(billed.has(bookingId)).toBe(false);
    });
  });
});
