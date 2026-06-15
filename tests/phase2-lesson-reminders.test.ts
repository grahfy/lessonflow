import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runLessonReminderBatch } from "@/lib/bookings/lesson-reminder-runner";
import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { DEFAULT_NOTIFICATION_SETTINGS_ID } from "@/lib/email/notification-settings";

/**
 * DB-backed tests for the pre-lesson reminder runner.
 *
 * runLessonReminderBatch selects approved, non-cancelled bookings starting
 * within `lessonReminderHoursBefore` whose `reminderSentAt` is null and that
 * carry an email, then stamps `reminderSentAt` (the dedup key) before sending.
 *
 * The test environment has no live SMTP, so delivery resolves to
 * `queued_no_smtp` and the runner records those as "failed". The authoritative
 * idempotency/eligibility signal we assert on is therefore `reminderSentAt`
 * (set before the send) plus the candidate count, not sentCount.
 */

const PREFIX = "P2REM";
// The runner records a `reminder_sent` audit row whose actorId is an FK to
// AdminUser, so the actor must be a real admin or the booking.update (with its
// nested audit create) rolls back atomically. Resolved per-test below.
let ACTOR = "";

let seq = 0;

async function setSettings(input: { global: boolean; lessonReminderEnabled: boolean; hoursBefore: number }) {
  await prisma.notificationSettings.upsert({
    where: { id: DEFAULT_NOTIFICATION_SETTINGS_ID },
    update: {
      globalAutomatedEmailEnabled: input.global,
      lessonReminderEnabled: input.lessonReminderEnabled,
      lessonReminderHoursBefore: input.hoursBefore
    },
    create: {
      id: DEFAULT_NOTIFICATION_SETTINGS_ID,
      categoryPreferences: {},
      globalAutomatedEmailEnabled: input.global,
      lessonReminderEnabled: input.lessonReminderEnabled,
      lessonReminderHoursBefore: input.hoursBefore
    }
  });
}

async function createBooking(overrides: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  // Default: starts in 2 hours (inside any reasonable window), approved, with email.
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return prisma.booking.create({
    data: {
      name: `${PREFIX} Student ${seq}`,
      email: `${PREFIX.toLowerCase()}.student.${seq}@example.com`,
      phone: "0400000000",
      address: "66 High Street, Northcote VIC 3070",
      houseNumber: "66",
      streetName: "High",
      streetType: "Street",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      startAt: start,
      endAt: new Date(start.getTime() + 60 * 60 * 1000),
      timezone: "Australia/Melbourne",
      status: "approved",
      ...overrides
    }
  });
}

async function cleanup() {
  await prisma.bookingAuditLog.deleteMany({ where: { booking: { name: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.notificationSettings.deleteMany({ where: { id: DEFAULT_NOTIFICATION_SETTINGS_ID } });
}

describe("phase2-lesson-reminders", () => {
  beforeEach(async () => {
    await cleanup();
    const owner = await ensureOwnerAdmin();
    ACTOR = owner.id;
  });
  afterEach(cleanup);

  it("selects an in-window approved booking and stamps reminderSentAt", async () => {
    await setSettings({ global: true, lessonReminderEnabled: true, hoursBefore: 24 });
    const booking = await createBooking();

    const result = await runLessonReminderBatch({ actorId: ACTOR });
    expect(result.suppressed).toBe(false);
    expect(result.candidateCount).toBe(1);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.reminderSentAt).not.toBeNull();
  });

  it("is idempotent: a second run finds zero candidates", async () => {
    await setSettings({ global: true, lessonReminderEnabled: true, hoursBefore: 24 });
    await createBooking();

    const first = await runLessonReminderBatch({ actorId: ACTOR });
    expect(first.candidateCount).toBe(1);

    const second = await runLessonReminderBatch({ actorId: ACTOR });
    expect(second.candidateCount).toBe(0);
    expect(second.sentCount).toBe(0);
  });

  it("is gated by lessonReminderEnabled: suppressed and no state change", async () => {
    await setSettings({ global: true, lessonReminderEnabled: false, hoursBefore: 24 });
    const booking = await createBooking();

    const result = await runLessonReminderBatch({ actorId: ACTOR });
    expect(result.suppressed).toBe(true);
    // Candidates are still computed pre-gate, but nothing is stamped.
    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.reminderSentAt).toBeNull();
  });

  it("is gated by the global automated-email flag", async () => {
    await setSettings({ global: false, lessonReminderEnabled: true, hoursBefore: 24 });
    const booking = await createBooking();

    const result = await runLessonReminderBatch({ actorId: ACTOR });
    expect(result.suppressed).toBe(true);
    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.reminderSentAt).toBeNull();
  });

  it("skips bookings outside the hours-before window", async () => {
    // 2-hour window; the booking starts in ~5 hours, so it is out of range.
    await setSettings({ global: true, lessonReminderEnabled: true, hoursBefore: 2 });
    const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const booking = await createBooking({ startAt: farStart, endAt: new Date(farStart.getTime() + 3600_000) });

    const result = await runLessonReminderBatch({ actorId: ACTOR });
    expect(result.candidateCount).toBe(0);
    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.reminderSentAt).toBeNull();
  });

  it("skips cancelled, already-reminded, and no-email bookings", async () => {
    await setSettings({ global: true, lessonReminderEnabled: true, hoursBefore: 24 });
    await createBooking({ status: "cancelled" });
    await createBooking({ reminderSentAt: new Date() });
    await createBooking({ email: "" });
    // One genuinely eligible booking among the noise.
    const eligible = await createBooking();

    const result = await runLessonReminderBatch({ actorId: ACTOR });
    expect(result.candidateCount).toBe(1);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: eligible.id } });
    expect(updated.reminderSentAt).not.toBeNull();
  });

  it("dryRun reports candidates but sends nothing and mutates no state", async () => {
    await setSettings({ global: true, lessonReminderEnabled: true, hoursBefore: 24 });
    const booking = await createBooking();

    const result = await runLessonReminderBatch({ actorId: ACTOR, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.candidateCount).toBe(1);
    expect(result.sentCount).toBe(0);

    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.reminderSentAt).toBeNull();
  });
});
