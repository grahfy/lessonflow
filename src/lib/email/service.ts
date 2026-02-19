import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
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

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const from = process.env.SMTP_FROM || "Melbourne Guitar School <no-reply@example.com>";
  const tx = getTransporter();

  if (!tx) {
    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: input.html,
        status: "queued_no_smtp"
      }
    });
    logEvent("email.queued_no_smtp", { to: input.to, subject: input.subject });
    return;
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
  } catch (error) {
    await prisma.outboundEmail.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        htmlBody: input.html,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      }
    });
    logError("email.failed", error, { to: input.to, subject: input.subject });
    return;
  }
}
