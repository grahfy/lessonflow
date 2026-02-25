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
import { logError, logEvent } from "@/lib/observability";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
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

  if (!tx) {
    if (isGmailConfigured()) {
      return sendGmailEmail(input);
    }

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
