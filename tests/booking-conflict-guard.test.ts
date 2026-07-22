// @vitest-environment node

/**
 * DB-backed tests for the shared booking-creation guard (AC-56 … AC-59) and the
 * business-hours singleton (AC-49).
 *
 * These hit the real database because the guard's whole value is in the DB
 * layer: the teacher row lock and the `FOR UPDATE` overlap read cannot be
 * proven with mocks, and AC-59 is specifically about two transactions racing.
 *
 * Seeded rows use the `bcg_test_` prefix; cleaned before and after each test.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { BookingConflictError, createBookingChecked } from "@/lib/booking/create";
import {
  BUSINESS_HOURS_ID,
  DEFAULT_BUSINESS_HOURS,
  getBusinessHours,
  saveBusinessHours,
  toWeeklyBusinessHours
} from "@/lib/booking/business-hours";

const PREFIX = "bcg_test_";
const TEACHER_ID = `${PREFIX}teacher`;
const OTHER_TEACHER_ID = `${PREFIX}teacher_other`;

const at = (iso: string) => new Date(iso);

async function cleanup() {
  await prisma.booking.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.adminUser.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.businessHours.deleteMany({ where: { id: BUSINESS_HOURS_ID } });
}

async function seedTeachers() {
  for (const id of [TEACHER_ID, OTHER_TEACHER_ID]) {
    await prisma.adminUser.create({
      data: { id, email: `${id}@example.com`, displayName: "Guard Teacher", passwordHash: "x" }
    });
  }
}

/** Minimal valid Booking payload; only the fields the guard reads vary. */
function bookingData(overrides: {
  label: string;
  startAt: Date;
  endAt: Date;
  assignedTeacherId?: string | null;
  status?: "approved" | "cancelled";
}) {
  return {
    firstName: "Guard",
    lastName: "Test",
    name: `${PREFIX}${overrides.label}`,
    email: `${PREFIX}${overrides.label}@example.com`,
    phone: "0400000000",
    address: "3000",
    postcode: "3000",
    lessonMode: "video" as const,
    skillLevel: "beginner" as const,
    lessonDuration: "min60" as const,
    startAt: overrides.startAt,
    endAt: overrides.endAt,
    timezone: "Australia/Melbourne",
    status: overrides.status ?? ("approved" as const),
    assignedTeacherId:
      overrides.assignedTeacherId === undefined ? TEACHER_ID : overrides.assignedTeacherId
  };
}

/** Creates a booking through the guard, inside its own transaction. */
function create(overrides: Parameters<typeof bookingData>[0]) {
  return prisma.$transaction((tx) => createBookingChecked(tx, bookingData(overrides)));
}

const TEN = at("2026-08-12T10:00:00+10:00");
const ELEVEN = at("2026-08-12T11:00:00+10:00");
const NOON = at("2026-08-12T12:00:00+10:00");

beforeEach(async () => {
  await cleanup();
  await seedTeachers();
});

afterAll(async () => {
  await cleanup();
});

describe("createBookingChecked — conflict guard (AC-58)", () => {
  it("rejects a booking overlapping an existing one for the same teacher", async () => {
    await create({ label: "first", startAt: TEN, endAt: ELEVEN });

    const overlapping = create({
      label: "clash",
      startAt: at("2026-08-12T10:30:00+10:00"),
      endAt: at("2026-08-12T11:30:00+10:00")
    });

    await expect(overlapping).rejects.toThrow(BookingConflictError);
    expect(await prisma.booking.count({ where: { name: { startsWith: PREFIX } } })).toBe(1);
  });

  it("names the conflicting booking in the error (AC-57)", async () => {
    const existing = await create({ label: "named", startAt: TEN, endAt: ELEVEN });

    const error = await create({ label: "loser", startAt: TEN, endAt: ELEVEN }).catch((e) => e);

    expect(error).toBeInstanceOf(BookingConflictError);
    expect(error.conflict.id).toBe(existing.id);
    expect(error.message).toContain(existing.id);
    expect(error.message).toContain(`${PREFIX}named`);
    // Melbourne local time, not UTC — the owner reads this in the admin UI.
    expect(error.message).toContain("10:00-11:00");
  });

  it("allows a back-to-back booking starting exactly when the previous ends", async () => {
    await create({ label: "earlier", startAt: TEN, endAt: ELEVEN });

    await expect(create({ label: "adjacent", startAt: ELEVEN, endAt: NOON })).resolves.toBeTruthy();
    expect(await prisma.booking.count({ where: { name: { startsWith: PREFIX } } })).toBe(2);
  });

  it("ignores cancelled bookings — they do not hold a slot", async () => {
    await create({ label: "cancelled", startAt: TEN, endAt: ELEVEN, status: "cancelled" });

    await expect(create({ label: "reuse", startAt: TEN, endAt: ELEVEN })).resolves.toBeTruthy();
  });

  it("scopes conflicts to one teacher", async () => {
    await create({ label: "teacher_a", startAt: TEN, endAt: ELEVEN });

    await expect(
      create({ label: "teacher_b", startAt: TEN, endAt: ELEVEN, assignedTeacherId: OTHER_TEACHER_ID })
    ).resolves.toBeTruthy();
  });

  it("refuses to run outside a transaction, where the lock would not hold", async () => {
    await expect(createBookingChecked(prisma, bookingData({ label: "no_tx", startAt: TEN, endAt: ELEVEN })))
      .rejects.toThrow(/must be called with a transaction client/i);
    expect(await prisma.booking.count({ where: { name: { startsWith: PREFIX } } })).toBe(0);
  });

  it("does not guard bookings with no assigned teacher", async () => {
    await create({ label: "unassigned_1", startAt: TEN, endAt: ELEVEN, assignedTeacherId: null });

    await expect(
      create({ label: "unassigned_2", startAt: TEN, endAt: ELEVEN, assignedTeacherId: null })
    ).resolves.toBeTruthy();
  });
});

describe("createBookingChecked — concurrent approval (AC-59)", () => {
  it("creates exactly one booking when two transactions race for the same slot", async () => {
    const results = await Promise.allSettled([
      create({ label: "race_a", startAt: TEN, endAt: ELEVEN }),
      create({ label: "race_b", startAt: TEN, endAt: ELEVEN })
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await prisma.booking.count({ where: { name: { startsWith: PREFIX } } })).toBe(1);
    // The loser must get the named-conflict error, not a raw DB deadlock. This
    // is what the teacher row lock buys: without it the losing transaction
    // fails on a lock error instead and the owner learns nothing useful.
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BookingConflictError);
  });

  it("lets both concurrent creates through when they do not overlap", async () => {
    const results = await Promise.allSettled([
      create({ label: "par_a", startAt: TEN, endAt: ELEVEN }),
      create({ label: "par_b", startAt: ELEVEN, endAt: NOON })
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await prisma.booking.count({ where: { name: { startsWith: PREFIX } } })).toBe(2);
  });
});

describe("createBookingChecked — recurring series", () => {
  it("rejects the WHOLE series when any one date conflicts", async () => {
    await create({ label: "blocker", startAt: at("2026-08-19T10:00:00+10:00"), endAt: at("2026-08-19T11:00:00+10:00") });

    const series = prisma.$transaction(async (tx) => {
      for (const week of [0, 1, 2]) {
        const start = new Date(TEN.getTime() + week * 7 * 24 * 60 * 60_000);
        await createBookingChecked(
          tx,
          bookingData({
            label: `series_${week}`,
            startAt: start,
            endAt: new Date(start.getTime() + 60 * 60_000)
          })
        );
      }
    });

    await expect(series).rejects.toThrow(BookingConflictError);
    // Week 0 was created before week 1 hit the blocker; the rollback removes it.
    expect(await prisma.booking.count({ where: { name: { startsWith: `${PREFIX}series_` } } })).toBe(0);
  });

  it("catches a series that collides with itself", async () => {
    const series = prisma.$transaction(async (tx) => {
      for (const label of ["self_a", "self_b"]) {
        await createBookingChecked(tx, bookingData({ label, startAt: TEN, endAt: ELEVEN }));
      }
    });

    await expect(series).rejects.toThrow(BookingConflictError);
  });
});

describe("business hours singleton (AC-49)", () => {
  it("returns defaults when no row exists", async () => {
    expect(await getBusinessHours()).toEqual(DEFAULT_BUSINESS_HOURS);
  });

  it("round-trips a saved configuration", async () => {
    const config = {
      ...DEFAULT_BUSINESS_HOURS,
      weekdays: DEFAULT_BUSINESS_HOURS.weekdays.map((day, index) =>
        index === 6 ? { isOpen: true, openMinute: 9 * 60, closeMinute: 13 * 60 } : day
      ),
      slotGranularityMinutes: 15,
      minimumNoticeHours: 48
    };

    await saveBusinessHours(config);

    expect(await getBusinessHours()).toEqual(config);
  });

  it("falls back to defaults when the Json column holds junk", async () => {
    await saveBusinessHours(DEFAULT_BUSINESS_HOURS);
    await prisma.businessHours.update({
      where: { id: BUSINESS_HOURS_ID },
      data: { weekdays: { nonsense: true } }
    });

    expect(await getBusinessHours()).toEqual(DEFAULT_BUSINESS_HOURS);
  });

  it("rejects an invalid configuration on write", async () => {
    await expect(
      saveBusinessHours({
        ...DEFAULT_BUSINESS_HOURS,
        weekdays: [{ isOpen: true, openMinute: 17 * 60, closeMinute: 9 * 60 }, ...DEFAULT_BUSINESS_HOURS.weekdays.slice(1)]
      })
    ).rejects.toThrow();
  });

  it("adapts the stored array into the shape deriveAvailableSlots reads", () => {
    const weekly = toWeeklyBusinessHours(DEFAULT_BUSINESS_HOURS.weekdays);

    expect(weekly[0]?.isOpen).toBe(false); // Sunday
    expect(weekly[3]).toEqual({ isOpen: true, openMinute: 9 * 60, closeMinute: 17 * 60 }); // Wednesday
  });
});
