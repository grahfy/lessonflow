import { BookingRequestStatus, LessonDuration, LessonMode, SkillLevel } from "@prisma/client";

type BookingSummary = {
  name: string;
  email: string;
  phone: string;
  address: string;
  lessonMode: LessonMode;
  skillLevel: SkillLevel;
  lessonDuration: LessonDuration;
  requestedStartAt: Date;
  isRecurring: boolean;
  recurrenceEndAt: Date | null;
};

function describeMode(mode: LessonMode): string {
  return mode === "in_person" ? "In-person" : "Video";
}

function describeDuration(duration: LessonDuration): string {
  return duration === "min30" ? "30 minutes" : "60 minutes";
}

function fmt(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Australia/Melbourne"
  }).format(date);
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
    subject: `New booking request: ${booking.name} (${describeDuration(booking.lessonDuration)})`,
    html: `
      <h2>New booking request awaiting approval</h2>
      <p><strong>Name:</strong> ${booking.name}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <p><strong>Phone:</strong> ${booking.phone}</p>
      <p><strong>Address:</strong> ${booking.address}</p>
      <p><strong>Mode:</strong> ${describeMode(booking.lessonMode)}</p>
      <p><strong>Skill level:</strong> ${booking.skillLevel}</p>
      <p><strong>Duration:</strong> ${describeDuration(booking.lessonDuration)}</p>
      <p><strong>Requested start:</strong> ${fmt(booking.requestedStartAt)}</p>
      <p><strong>Recurring weekly:</strong> ${recurring}</p>
    `
  };
}

export function customerBookingStatusTemplate(input: {
  name: string;
  status: BookingRequestStatus;
  when: Date;
}) {
  const statusText = input.status === "approved" ? "approved" : "cancelled";
  return {
    subject: `Your booking has been ${statusText}`,
    html: `
      <h2>Booking update</h2>
      <p>Hi ${input.name},</p>
      <p>Your booking has been <strong>${statusText}</strong>.</p>
      <p><strong>Lesson time:</strong> ${fmt(input.when)}</p>
    `
  };
}

export function ownerDailyDigestTemplate(input: {
  date: Date;
  rows: Array<{
    name: string;
    startAt: Date;
    lessonDuration: LessonDuration;
    lessonMode: LessonMode;
    status: string;
  }>;
}) {
  const items = input.rows
    .map(
      (row) =>
        `<li>${fmt(row.startAt)} - ${row.name} - ${describeDuration(row.lessonDuration)} - ${describeMode(
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
