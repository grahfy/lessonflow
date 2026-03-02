/**
 * Booking email event wrappers.
 *
 * Route handlers call these functions instead of coupling directly to template names. This keeps
 * workflow code focused on domain actions while `sendEmail()` handles transport selection and
 * outbound logging.
 */
import { Booking, BookingRequestStatus } from "@/generated/prisma/client";

import { sendEmail } from "@/lib/email/service";
import {
  customerBookingMovedTemplate,
  customerBookingReminderTemplate,
  customerBookingStatusTemplate,
  customerCustomMessageTemplate
} from "@/lib/email/templates";

export async function sendCustomerBookingStatusEmail(input: {
  email: string;
  name: string;
  status: BookingRequestStatus;
  when: Date;
  portalAccess?: {
    loginUrl: string;
    generatedPassword: string;
  } | null;
}) {
  // Approval emails may include one-time portal credentials. The template builder hides that
  // branching so callers only pass `portalAccess` when credentials were generated.
  const template = customerBookingStatusTemplate({
    name: input.name,
    status: input.status,
    when: input.when,
    portalAccess: input.portalAccess ?? null
  });
  await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });
}

export async function sendCustomerBookingMovedEmail(input: {
  email: string;
  name: string;
  oldWhen: Date;
  newWhen: Date;
}) {
  // Include both times so customers can verify the reschedule without cross-referencing older mail.
  const template = customerBookingMovedTemplate({
    name: input.name,
    oldWhen: input.oldWhen,
    newWhen: input.newWhen
  });
  await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });
}

export async function sendCustomerReminderEmail(input: {
  email: string;
  name: string;
  when: Date;
}) {
  // Reminder sends intentionally reuse the same template/delivery path as automated reminder jobs.
  const template = customerBookingReminderTemplate({
    name: input.name,
    when: input.when
  });
  await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });
}

export async function sendCustomerCustomEmail(input: {
  email: string;
  name: string;
  subject: string;
  message: string;
}) {
  // Custom messages still go through the shared delivery service to keep audit logging and
  // transport fallback behavior (SMTP/Gmail/queue) consistent.
  const template = customerCustomMessageTemplate({
    name: input.name,
    subject: input.subject,
    message: input.message
  });
  await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });
}

/**
 * Minimal shape required by the daily digest email.
 *
 * Keeping this narrow avoids coupling digest generation to larger booking payloads used in admin UI.
 */
export type BookingDigestRow = Pick<
  Booking,
  "name" | "startAt" | "lessonDuration" | "customDurationMinutes" | "lessonMode" | "status"
>;
