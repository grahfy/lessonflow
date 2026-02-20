import { BookingRequestStatus, LessonDuration, LessonMode, SkillLevel } from "@prisma/client";

type BookingSummary = {
  name: string;
  email: string;
  phone: string;
  address: string;
  lessonMode: LessonMode;
  skillLevel: SkillLevel;
  lessonDuration: LessonDuration;
  customDurationMinutes?: number | null;
  requestedStartAt: Date;
  isRecurring: boolean;
  recurrenceEndAt: Date | null;
};

function describeMode(mode: LessonMode): string {
  return mode === "in_person" ? "In-person" : "Video";
}

function describeDuration(duration: LessonDuration, customDurationMinutes?: number | null): string {
  if (customDurationMinutes && customDurationMinutes > 0) {
    return `${customDurationMinutes} minutes`;
  }
  return duration === "min30" ? "30 minutes" : "60 minutes";
}

function fmt(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Australia/Melbourne"
  }).format(date);
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function ownerNewContactTemplate(input: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
}) {
  return {
    subject: `New contact inquiry from ${input.name}`,
    html: `
      <h2>New contact inquiry</h2>
      <p><strong>Name:</strong> ${input.name}</p>
      <p><strong>Email:</strong> ${input.email}</p>
      <p><strong>Phone:</strong> ${input.phone || "-"}</p>
      <p><strong>Message:</strong></p>
      <p>${input.message.replace(/\n/g, "<br/>")}</p>
    `
  };
}

export function ownerPendingBookingTemplate(booking: BookingSummary) {
  const recurring = booking.isRecurring
    ? `Yes, until ${booking.recurrenceEndAt ? fmt(booking.recurrenceEndAt) : "-"}`
    : "No";
  return {
    subject: `New booking request: ${booking.name} (${describeDuration(
      booking.lessonDuration,
      booking.customDurationMinutes
    )})`,
    html: `
      <h2>New booking request awaiting approval</h2>
      <p><strong>Name:</strong> ${booking.name}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <p><strong>Phone:</strong> ${booking.phone}</p>
      <p><strong>Address:</strong> ${booking.address}</p>
      <p><strong>Mode:</strong> ${describeMode(booking.lessonMode)}</p>
      <p><strong>Skill level:</strong> ${booking.skillLevel}</p>
      <p><strong>Duration:</strong> ${describeDuration(booking.lessonDuration, booking.customDurationMinutes)}</p>
      <p><strong>Requested start:</strong> ${fmt(booking.requestedStartAt)}</p>
      <p><strong>Recurring weekly:</strong> ${recurring}</p>
    `
  };
}

export function customerBookingStatusTemplate(input: {
  name: string;
  status: BookingRequestStatus;
  when: Date;
  portalAccess?: {
    loginUrl: string;
    generatedPassword: string;
  } | null;
}) {
  const statusText = input.status === "approved" ? "approved" : "cancelled";
  const includePortal = input.status === "approved" && !!input.portalAccess;
  const portalSection = includePortal
    ? `
      <h3>Student portal access</h3>
      <p>You can now access your student portal for upcoming lessons and assigned materials.</p>
      <p><strong>Login URL:</strong> <a href="${escapeHtml(input.portalAccess?.loginUrl || "")}">${escapeHtml(
        input.portalAccess?.loginUrl || ""
      )}</a></p>
      <p><strong>Login method:</strong> Full name + postcode + password</p>
      <p><strong>Temporary password:</strong> ${escapeHtml(input.portalAccess?.generatedPassword || "")}</p>
    `
    : "";
  return {
    subject: `Your booking has been ${statusText}`,
    html: `
      <h2>Booking update</h2>
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>Your booking has been <strong>${statusText}</strong>.</p>
      <p><strong>Lesson time:</strong> ${fmt(input.when)}</p>
      ${portalSection}
    `
  };
}

export function customerBookingMovedTemplate(input: {
  name: string;
  oldWhen: Date;
  newWhen: Date;
}) {
  return {
    subject: "Your lesson time has been updated",
    html: `
      <h2>Lesson time updated</h2>
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>Your lesson time has been updated.</p>
      <p><strong>Previous time:</strong> ${fmt(input.oldWhen)}</p>
      <p><strong>New time:</strong> ${fmt(input.newWhen)}</p>
    `
  };
}

export function customerBookingReminderTemplate(input: {
  name: string;
  when: Date;
}) {
  return {
    subject: "Lesson reminder",
    html: `
      <h2>Lesson reminder</h2>
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>This is a reminder for your upcoming lesson.</p>
      <p><strong>Lesson time:</strong> ${fmt(input.when)}</p>
    `
  };
}

export function customerCustomMessageTemplate(input: {
  name: string;
  subject: string;
  message: string;
}) {
  return {
    subject: input.subject.trim(),
    html: `
      <h2>${escapeHtml(input.subject)}</h2>
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>${escapeHtml(input.message).replace(/\n/g, "<br/>")}</p>
    `
  };
}

export function customerInvoiceTemplate(input: {
  invoiceNumber: string;
  customerName: string;
  dueAt: Date;
  totalCents: number;
  sellerBusinessName: string;
}) {
  return {
    subject: `Invoice ${input.invoiceNumber} from ${input.sellerBusinessName}`,
    html: `
      <h2>Your invoice is ready</h2>
      <p>Hi ${escapeHtml(input.customerName)},</p>
      <p>Please find invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> attached as a PDF.</p>
      <p><strong>Total due:</strong> ${money(input.totalCents)}</p>
      <p><strong>Due date:</strong> ${fmt(input.dueAt)}</p>
      <p>If you've already paid, please disregard this message.</p>
    `
  };
}

/**
 * Reminder template for overdue invoices using staged follow-up cadence.
 */
export function customerInvoiceReminderTemplate(input: {
  invoiceNumber: string;
  customerName: string;
  dueAt: Date;
  totalCents: number;
  sellerBusinessName: string;
  overdueDays: number;
}) {
  return {
    subject: `Reminder: invoice ${input.invoiceNumber} is overdue`,
    html: `
      <h2>Invoice payment reminder</h2>
      <p>Hi ${escapeHtml(input.customerName)},</p>
      <p>This is a reminder that invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> is currently overdue.</p>
      <p><strong>Total due:</strong> ${money(input.totalCents)}</p>
      <p><strong>Due date:</strong> ${fmt(input.dueAt)}</p>
      <p><strong>Overdue by:</strong> ${input.overdueDays} day${input.overdueDays === 1 ? "" : "s"}</p>
      <p>If payment has already been made, please disregard this reminder.</p>
      <p>${escapeHtml(input.sellerBusinessName)}</p>
    `
  };
}

export function ownerDailyDigestTemplate(input: {
  date: Date;
  rows: Array<{
    name: string;
    startAt: Date;
    lessonDuration: LessonDuration;
    customDurationMinutes?: number | null;
    lessonMode: LessonMode;
    status: string;
  }>;
}) {
  const items = input.rows
    .map(
      (row) =>
        `<li>${fmt(row.startAt)} - ${row.name} - ${describeDuration(
          row.lessonDuration,
          row.customDurationMinutes
        )} - ${describeMode(
          row.lessonMode
        )} (${row.status})</li>`
    )
    .join("");
  return {
    subject: `Daily bookings digest - ${new Intl.DateTimeFormat("en-AU", {
      dateStyle: "long",
      timeZone: "Australia/Melbourne"
    }).format(input.date)}`,
    html: `
      <h2>Today&apos;s bookings</h2>
      <ul>${items || "<li>No bookings for today.</li>"}</ul>
    `
  };
}
