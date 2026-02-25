/**
 * Email sending service using nodemailer with database logging.
 * 
 * SECURITY: All sent emails are logged to the database for audit trail.
 * Falls back to queueing in DB if SMTP is not configured.
 * Supports attachments for PDF invoices.
 */

import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
import { isGmailConfigured, sendGmailEmail } from "@/lib/email/gmail-service";
import { getOwnerEmail } from "@/lib/env";
import { logError, logEvent } from "@/lib/observability";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

export type SendEmailResult = {
  status: "sent" | "queued_no_smtp" | "failed";
  error?: string;
};

let transporter: nodemailer.Transporter | null = null;

function normalizeAddressValue(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  return (bracketMatch?.[1] || trimmed).trim();
}

function mergeBccValues(existing: string | string[] | undefined, extra: string): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  const addValue = (value: string) => {
    const normalized = normalizeAddressValue(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    merged.push(value);
  };

  if (Array.isArray(existing)) {
    for (const value of existing) addValue(value);
  } else if (typeof existing === "string" && existing.trim()) {
    addValue(existing);
  }

  addValue(extra);
  return merged;
}

function getCustomerAuditBccRecipient(to: string): string | null {
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) {
    return null;
  }

  // Only BCC customer-facing emails. Messages already addressed to the owner/admin should not
  // duplicate the same mailbox.
  if (normalizeAddressValue(to) === normalizeAddressValue(ownerEmail)) {
    return null;
  }

  return ownerEmail;
}

/**
 * Lazily creates and caches the SMTP transporter when minimum credentials exist.
 *
 * Returning `null` is intentional: callers then fall back to Gmail API or queue-only behavior
 * instead of failing at module load time when SMTP is not configured.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass
      }
    });
  }

  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.SMTP_FROM || "Melbourne Guitar School <no-reply@example.com>";
  const tx = getTransporter();
  const ownerBcc = getCustomerAuditBccRecipient(input.to);
  const bcc = ownerBcc ? mergeBccValues(input.bcc, ownerBcc) : input.bcc;

  if (!tx) {
    // Prefer Gmail API over queueing when available because some hosts block outbound SMTP ports.
    if (isGmailConfigured()) {
      return sendGmailEmail({
        ...input,
        bcc
      });
    }

    // Preserve business workflows by recording the outbound email even when no live transport is
    // configured (for example local development or a partially configured production host).
    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: input.html,
        status: "queued_no_smtp"
      }
    });
    logEvent("email.queued_no_smtp", { to: input.to, subject: input.subject });
    return { status: "queued_no_smtp" };
  }

  try {
    await tx.sendMail({
      from,
      to: input.to,
      bcc,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType
      }))
    });

    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: input.html,
        status: "sent"
      }
    });
    logEvent("email.sent", { to: input.to, subject: input.subject });
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (isGmailConfigured()) {
      // SMTP can fail transiently (provider blocks, auth drift, TLS issues). We attempt Gmail API
      // before reporting failure so a configured secondary path can keep operations flowing.
      logError("email.smtp_failed", error, { to: input.to, subject: input.subject });

      const gmailResult = await sendGmailEmail(input);
      if (gmailResult.status === "sent") {
        logEvent("email.smtp_failed_gmail_fallback_sent", {
          to: input.to,
          subject: input.subject
        });
        return gmailResult;
      }

      return {
        status: "failed",
        error: `SMTP failed: ${message}; Gmail fallback failed: ${gmailResult.error ?? "Unknown error"}`
      };
    }

    // No fallback path is available; record the failed attempt for support/admin visibility.
    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: input.html,
        status: "failed",
        error: message
      }
    });
    logError("email.failed", error, { to: input.to, subject: input.subject });
    return { status: "failed", error: message };
  }
}
