import { Booking, BookingRequestStatus } from "@prisma/client";

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

export type BookingDigestRow = Pick<
  Booking,
  "name" | "startAt" | "lessonDuration" | "customDurationMinutes" | "lessonMode" | "status"
>;
