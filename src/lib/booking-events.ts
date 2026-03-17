/**
 * Booking email event wrappers.
 *
 * Route handlers call these functions instead of coupling directly to template names. This keeps
 * workflow code focused on domain actions while `sendEmail()` handles transport selection and
 * outbound logging.
 */
import { Booking, BookingRequestStatus, LessonMode, LessonDuration, SkillLevel, AuditAction } from "@/generated/prisma/client";

import { sendEmail, SendEmailResult } from "@/lib/email/service";
import {
  customerBookingMovedTemplate,
  customerBookingReminderTemplate,
  customerBookingStatusTemplate,
  customerCustomMessageTemplate,
  ownerPendingBookingTemplate
} from "@/lib/email/templates";
import { getOwnerEmail } from "@/lib/env";
import { prisma } from "@/lib/db";

export async function sendOwnerBookingEmail(input: {
  bookingRequest: {
    name: string;
    email: string;
    phone: string;
    address: string;
    lessonMode: LessonMode;
    skillLevel: SkillLevel;
    lessonDuration: LessonDuration;
    customDurationMinutes: number | null;
    requestedStartAt: Date;
    isRecurring: boolean;
    recurrenceEndAt: Date | null;
  };
}): Promise<SendEmailResult> {
  const template = ownerPendingBookingTemplate(input.bookingRequest);
  return sendEmail({
    to: getOwnerEmail(),
    subject: template.subject,
    html: template.html
  });
}

type AuditInput = {
  bookingId?: string;
  actorId: string;
  action: AuditAction;
  details?: string;
};

async function recordAudit(audit: AuditInput | undefined) {
  if (!audit) return;
  await prisma.bookingAuditLog.create({
    data: {
      bookingId: audit.bookingId,
      actorId: audit.actorId,
      action: audit.action,
      details: audit.details
    }
  });
}

export async function sendCustomerBookingStatusEmail(input: {
  email: string;
  name: string;
  status: BookingRequestStatus;
  when: Date;
  portalAccess?: {
    loginUrl: string;
    generatedPassword: string;
  } | null;
  audit?: AuditInput;
}): Promise<SendEmailResult> {
  // Approval emails may include one-time portal credentials. The template builder hides that
  // branching so callers only pass `portalAccess` when credentials were generated.
  const template = customerBookingStatusTemplate({
    name: input.name,
    status: input.status,
    when: input.when,
    portalAccess: input.portalAccess ?? null
  });
  const result = await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });

  if (result.status === "sent") {
    await recordAudit(input.audit);
  }

  return result;
}

export async function sendCustomerBookingMovedEmail(input: {
  email: string;
  name: string;
  oldWhen: Date;
  newWhen: Date;
  audit?: AuditInput;
}): Promise<SendEmailResult> {
  // Include both times so customers can verify the reschedule without cross-referencing older mail.
  const template = customerBookingMovedTemplate({
    name: input.name,
    oldWhen: input.oldWhen,
    newWhen: input.newWhen
  });
  const result = await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });

  if (result.status === "sent") {
    await recordAudit(input.audit);
  }

  return result;
}

export async function sendCustomerReminderEmail(input: {
  email: string;
  name: string;
  when: Date;
  audit?: AuditInput;
}): Promise<SendEmailResult> {
  // Reminder sends intentionally reuse the same template/delivery path as automated reminder jobs.
  const template = customerBookingReminderTemplate({
    name: input.name,
    when: input.when
  });
  const result = await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });

  if (result.status === "sent") {
    await recordAudit(input.audit);
  }

  return result;
}

export async function sendCustomerCustomEmail(input: {
  email: string;
  name: string;
  subject: string;
  message: string;
  audit?: AuditInput;
}): Promise<SendEmailResult> {
  // Custom messages still go through the shared delivery service to keep audit logging and
  // transport fallback behavior (SMTP/Gmail/queue) consistent.
  const template = customerCustomMessageTemplate({
    name: input.name,
    subject: input.subject,
    message: input.message
  });
  const result = await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });

  if (result.status === "sent") {
    await recordAudit(input.audit);
  }

  return result;
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
