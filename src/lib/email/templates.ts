/**
 * Shared HTML email templates for admin and customer notifications.
 *
 * Centralizing template layout and branding here keeps email copy consistent across booking,
 * portal, invoice, reminder, and digest workflows while still allowing route-specific content.
 */
import { BookingRequestStatus, LessonDuration, LessonMode, SkillLevel } from "@prisma/client";

import { getOwnerEmail, getPublicSiteUrl } from "@/lib/env";

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

/**
 * Converts lesson mode enum values into customer-facing labels.
 */
function describeMode(mode: LessonMode): string {
  return mode === "in_person" ? "In-person" : "Video";
}

/**
 * Converts the duration enum (or custom minute override) into readable copy.
 */
function describeDuration(duration: LessonDuration, customDurationMinutes?: number | null): string {
  if (customDurationMinutes && customDurationMinutes > 0) {
    return `${customDurationMinutes} minutes`;
  }
  return duration === "min30" ? "30 minutes" : "60 minutes";
}

/**
 * Formats dates in the business timezone for outbound communication.
 */
function fmt(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Australia/Melbourne"
  }).format(date);
}

/**
 * Formats integer cents for invoice emails.
 */
function money(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

/**
 * Escapes user-provided values before inserting into HTML email strings.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Escapes user-provided text and preserves line breaks for display in HTML.
 */
function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

/**
 * Resolves branding/signature values with env overrides for deployment-specific contact details.
 */
function getEmailBranding() {
  const siteUrl = getPublicSiteUrl().replace(/\/+$/, "");
  return {
    brandName: "Melbourne Guitar School",
    siteUrl,
    phone: process.env.CONTACT_PHONE || "0401 489 437",
    email: process.env.CONTACT_EMAIL || getOwnerEmail(),
    address: process.env.CONTACT_ADDRESS || "Rear 66/68 High St, Northcote VIC 3070",
    logoUrl: `${siteUrl}/images/mgs-logo.png`
  };
}

/**
 * Shared signature block appended to all branded emails.
 */
function renderSignatureHtml() {
  const branding = getEmailBranding();
  return `
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e3e8f3;">
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;padding:0 0 12px;">
            <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.brandName)}" width="164" style="display:block;width:164px;max-width:100%;height:auto;border:0;" />
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#16233d;"><strong>${escapeHtml(branding.brandName)}</strong></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#41506f;">
        Call or text: <a href="tel:${escapeHtml(branding.phone.replace(/\s+/g, ""))}" style="color:#2247d8;text-decoration:none;">${escapeHtml(branding.phone)}</a><br/>
        Email: <a href="mailto:${escapeHtml(branding.email)}" style="color:#2247d8;text-decoration:none;">${escapeHtml(branding.email)}</a><br/>
        Website: <a href="${escapeHtml(branding.siteUrl)}" style="color:#2247d8;text-decoration:none;">${escapeHtml(branding.siteUrl.replace(/^https?:\/\//, ""))}</a><br/>
        Studio: ${escapeHtml(branding.address)}
      </p>
    </div>
  `;
}

/**
 * Shared email chrome wrapper (card layout + preview text + branding signature).
 *
 * Individual templates only provide the subject/body content so branding and styling changes
 * remain centralized.
 */
function renderEmailLayout(input: {
  title: string;
  previewText?: string;
  leadHtml?: string;
  contentHtml: string;
}) {
  const branding = getEmailBranding();
  const previewText = input.previewText || input.title;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(input.title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f7fb;color:#10203a;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
        <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
          ${escapeHtml(previewText)}
        </span>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f4f7fb;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 10px 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6d7c98;">
                    ${escapeHtml(branding.brandName)}
                  </td>
                </tr>
                <tr>
                  <td style="background:#ffffff;border:1px solid #dfe6f2;border-radius:14px;padding:24px 22px;box-shadow:0 8px 24px rgba(14,23,43,0.06);">
                    <h2 style="margin:0 0 12px;font-size:22px;line-height:1.2;color:#0f1f3a;">${escapeHtml(input.title)}</h2>
                    ${input.leadHtml ? `<div style=\"margin:0 0 14px;font-size:14px;line-height:1.6;color:#41506f;\">${input.leadHtml}</div>` : ""}
                    <div style="font-size:14px;line-height:1.65;color:#16233d;">
                      ${input.contentHtml}
                    </div>
                    ${renderSignatureHtml()}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function ownerNewContactTemplate(input: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
}) {
  return {
    subject: `New contact inquiry from ${input.name}`,
    html: renderEmailLayout({
      title: "New contact inquiry",
      previewText: `New contact inquiry from ${input.name}`,
      leadHtml: "A new inquiry was submitted through the website contact form.",
      contentHtml: `
        <p style="margin:0 0 8px;"><strong>Name:</strong> ${escapeHtml(input.name)}</p>
        <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(input.email)}</p>
        <p style="margin:0 0 14px;"><strong>Phone:</strong> ${escapeHtml(input.phone || "-")}</p>
        <p style="margin:0 0 6px;"><strong>Message</strong></p>
        <div style="padding:12px;border:1px solid #e3e8f3;border-radius:10px;background:#f8faff;color:#16233d;">
          ${nl2br(input.message)}
        </div>
      `
    })
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
    html: renderEmailLayout({
      title: "New booking request awaiting approval",
      previewText: `Booking request from ${booking.name}`,
      leadHtml: "A new lesson request has been submitted and is waiting for approval in the admin bookings console.",
      contentHtml: `
        <p style="margin:0 0 10px;"><strong>Name:</strong> ${escapeHtml(booking.name)}</p>
        <p style="margin:0 0 10px;"><strong>Email:</strong> ${escapeHtml(booking.email)}</p>
        <p style="margin:0 0 10px;"><strong>Phone:</strong> ${escapeHtml(booking.phone)}</p>
        <p style="margin:0 0 10px;"><strong>Address:</strong> ${escapeHtml(booking.address)}</p>
        <p style="margin:0 0 10px;"><strong>Mode:</strong> ${describeMode(booking.lessonMode)}</p>
        <p style="margin:0 0 10px;"><strong>Skill level:</strong> ${escapeHtml(booking.skillLevel)}</p>
        <p style="margin:0 0 10px;"><strong>Duration:</strong> ${describeDuration(booking.lessonDuration, booking.customDurationMinutes)}</p>
        <p style="margin:0 0 10px;"><strong>Requested start:</strong> ${fmt(booking.requestedStartAt)}</p>
        <p style="margin:0;"><strong>Recurring weekly:</strong> ${escapeHtml(recurring)}</p>
      `
    })
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
  // Internal request states are intentionally simplified for customers: any non-approved outcome
  // is communicated as "cancelled" to avoid exposing admin workflow distinctions.
  const statusText = input.status === "approved" ? "approved" : "cancelled";
  const includePortal = input.status === "approved" && !!input.portalAccess;
  const portalSection = includePortal
    ? `
      <h3 style="margin:16px 0 8px;font-size:16px;line-height:1.3;color:#0f1f3a;">Student portal access</h3>
      <p style="margin:0 0 8px;">You can now access your student portal for upcoming lessons and assigned materials.</p>
      <p style="margin:0 0 8px;"><strong>Login URL:</strong> <a href="${escapeHtml(input.portalAccess?.loginUrl || "")}" style="color:#2247d8;">${escapeHtml(
        input.portalAccess?.loginUrl || ""
      )}</a></p>
      <p style="margin:0 0 8px;"><strong>Login method:</strong> Full name + postcode + password</p>
      <p style="margin:0;"><strong>Temporary password:</strong> ${escapeHtml(input.portalAccess?.generatedPassword || "")}</p>
    `
    : "";
  return {
    subject: `Your booking has been ${statusText}`,
    html: renderEmailLayout({
      title: "Booking update",
      previewText: `Your booking has been ${statusText}`,
      contentHtml: `
        <p style="margin:0 0 10px;">Hi ${escapeHtml(input.name)},</p>
        <p style="margin:0 0 10px;">Your booking has been <strong>${escapeHtml(statusText)}</strong>.</p>
        <p style="margin:0 0 12px;"><strong>Lesson time:</strong> ${fmt(input.when)}</p>
        ${portalSection}
      `
    })
  };
}

export function customerBookingMovedTemplate(input: {
  name: string;
  oldWhen: Date;
  newWhen: Date;
}) {
  return {
    subject: "Your lesson time has been updated",
    html: renderEmailLayout({
      title: "Lesson time updated",
      previewText: "Your lesson time has been updated",
      contentHtml: `
        <p style="margin:0 0 10px;">Hi ${escapeHtml(input.name)},</p>
        <p style="margin:0 0 10px;">Your lesson time has been updated.</p>
        <p style="margin:0 0 10px;"><strong>Previous time:</strong> ${fmt(input.oldWhen)}</p>
        <p style="margin:0;"><strong>New time:</strong> ${fmt(input.newWhen)}</p>
      `
    })
  };
}

export function customerBookingReminderTemplate(input: {
  name: string;
  when: Date;
}) {
  return {
    subject: "Lesson reminder",
    html: renderEmailLayout({
      title: "Lesson reminder",
      previewText: "This is a reminder for your upcoming lesson.",
      contentHtml: `
        <p style="margin:0 0 10px;">Hi ${escapeHtml(input.name)},</p>
        <p style="margin:0 0 10px;">This is a reminder for your upcoming lesson.</p>
        <p style="margin:0;"><strong>Lesson time:</strong> ${fmt(input.when)}</p>
      `
    })
  };
}

export function customerCustomMessageTemplate(input: {
  name: string;
  subject: string;
  message: string;
}) {
  return {
    // Trim once and reuse the same value in the subject + title so formatting stays aligned.
    subject: input.subject.trim(),
    html: renderEmailLayout({
      title: input.subject.trim(),
      previewText: input.subject.trim(),
      contentHtml: `
        <p style="margin:0 0 10px;">Hi ${escapeHtml(input.name)},</p>
        <div style="padding:12px;border:1px solid #e3e8f3;border-radius:10px;background:#f8faff;color:#16233d;">
          ${nl2br(input.message)}
        </div>
      `
    })
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
    html: renderEmailLayout({
      title: "Your invoice is ready",
      previewText: `Invoice ${input.invoiceNumber} is ready`,
      contentHtml: `
        <p style="margin:0 0 10px;">Hi ${escapeHtml(input.customerName)},</p>
        <p style="margin:0 0 10px;">Please find invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> attached as a PDF.</p>
        <p style="margin:0 0 10px;"><strong>Total due:</strong> ${money(input.totalCents)}</p>
        <p style="margin:0 0 10px;"><strong>Due date:</strong> ${fmt(input.dueAt)}</p>
        <p style="margin:0;">If you've already paid, please disregard this message.</p>
      `
    })
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
    html: renderEmailLayout({
      title: "Invoice payment reminder",
      previewText: `Invoice ${input.invoiceNumber} is overdue`,
      contentHtml: `
        <p style="margin:0 0 10px;">Hi ${escapeHtml(input.customerName)},</p>
        <p style="margin:0 0 10px;">This is a reminder that invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> is currently overdue.</p>
        <p style="margin:0 0 10px;"><strong>Total due:</strong> ${money(input.totalCents)}</p>
        <p style="margin:0 0 10px;"><strong>Due date:</strong> ${fmt(input.dueAt)}</p>
        <p style="margin:0 0 10px;"><strong>Overdue by:</strong> ${input.overdueDays} day${input.overdueDays === 1 ? "" : "s"}</p>
        <p style="margin:0 0 10px;">If payment has already been made, please disregard this reminder.</p>
        <p style="margin:0;">${escapeHtml(input.sellerBusinessName)}</p>
      `
    })
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
  // A plain list renders more reliably across email clients than table-heavy markup.
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
    html: renderEmailLayout({
      title: "Today's bookings",
      previewText: "Daily bookings digest",
      contentHtml: `
        <p style="margin:0 0 12px;">Daily bookings digest for ${new Intl.DateTimeFormat("en-AU", {
          dateStyle: "long",
          timeZone: "Australia/Melbourne"
        }).format(input.date)}.</p>
        <ul style="margin:0;padding-left:18px;">${items || "<li>No bookings for today.</li>"}</ul>
      `
    })
  };
}
