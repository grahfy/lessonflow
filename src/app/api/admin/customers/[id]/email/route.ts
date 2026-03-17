import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canManagePrimaryTeacherCustomer } from "@/lib/admin/permissions";
import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { verifyCaptchaSubmission } from "@/lib/captcha";
import { prisma } from "@/lib/db";
import { getCustomerEmailHistory } from "@/lib/email/history";
import { sendEmail } from "@/lib/email/service";
import { customerCustomMessageTemplate } from "@/lib/email/templates";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const sendEmailSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional()
});

/**
 * GET: Returns recent email history for this customer based on their email address.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        email: true,
        normalizedEmail: true,
        primaryTeacherId: true
      }
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const history = await getCustomerEmailHistory({
      id,
      email: customer.email,
      normalizedEmail: customer.normalizedEmail
    });

    return NextResponse.json({ history });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load email history.");
  }
}

/**
 * POST: Sends a custom email to the customer.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (!canManagePrimaryTeacherCustomer(admin, customer.primaryTeacherId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = sendEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    // CAPTCHA verification — enforced in production to add defence-in-depth on top of
    // session authentication. Dev/test environments bypass this to keep workflows fast.
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
      const captchaResult = verifyCaptchaSubmission({
        captchaToken: parsed.data.captchaToken || "",
        captchaAnswer: parsed.data.captchaAnswer || ""
      });
      if (!captchaResult.ok) {
        return NextResponse.json({ error: captchaResult.message, code: captchaResult.code }, { status: 400 });
      }
    }

    const template = customerCustomMessageTemplate({
      name: customer.fullName,
      subject: parsed.data.subject,
      message: parsed.data.message
    });

    const result = await sendEmail({
      to: customer.email,
      subject: template.subject,
      html: template.html
    });

    return NextResponse.json({ 
      ok: true, 
      status: result.status,
      message: result.status === "sent" ? "Email sent successfully." : "Email queued for later delivery."
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to send email.");
  }
}
