import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminFromRequest } from "@/lib/admin-route";
import { jsonUnexpectedError } from "@/lib/api-errors";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";

const MAX_IMPORT_ROWS = 1000;
const MAX_IMPORT_BYTES = 1024 * 1024;

const importPayloadSchema = z.object({
  customers: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_IMPORT_ROWS)
});

type CsvRow = Record<string, unknown>;

/**
 * Reads the first populated cell across several header aliases.
 *
 * RATIONALE: Customer CSV imports may come from different spreadsheets or
 * manual exports, so we accept a small set of common header variants rather
 * than forcing one exact column naming convention.
 */
function readRowString(row: CsvRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    }
  }
  return "";
}

/** Normalizes free-form skill labels into the product's supported enum. */
function normalizeSkillLevel(raw: string): "beginner" | "intermediate" | "advanced" {
  const value = raw.trim().toLowerCase();
  if (value === "intermediate" || value === "advanced") {
    return value;
  }
  return "beginner";
}

/** Maps common online/virtual wording onto the stored lesson mode enum. */
function normalizeLessonMode(raw: string): "in_person" | "video" {
  const value = raw.trim().toLowerCase();
  if (value === "video" || value === "online" || value === "virtual") {
    return "video";
  }
  return "in_person";
}

/**
 * Imports a batch of admin-supplied customer rows.
 *
 * RATIONALE: The route validates payload size, rate-limits per admin IP, and
 * resolves dedupe matches before creating any customer row so the import tool
 * stays safe to use against live data.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : 0;
    if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: `Import payload too large. Maximum ${MAX_IMPORT_BYTES} bytes.` },
        { status: 413 }
      );
    }

    const rateLimit = consumeRateLimit({
      key: `admin-customers-import:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 10 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many import attempts. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = importPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid import payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const createdCustomerIds: string[] = [];
    const errors: string[] = [];
    const seenNormalizedEmails = new Set<string>();
    const seenNormalizedPhones = new Set<string>();

    for (const [index, row] of parsed.data.customers.entries()) {
      const rowNumber = index + 1;
      const firstName = readRowString(row, ["first_name", "firstName", "First Name", "firstname", "FirstName"]);
      const lastName = readRowString(row, ["last_name", "lastName", "Last Name", "lastname", "LastName"]);
      const email = readRowString(row, ["email", "Email", "email_address", "Email Address"]);
      const phone = readRowString(row, ["phone", "Phone", "mobile", "Mobile", "phone_number", "Phone Number"]);

      if (!firstName && !lastName) {
        errors.push(`Row ${rowNumber}: Customer must have a first or last name.`);
        continue;
      }
      if (!email && !phone) {
        errors.push(`Row ${rowNumber}: Provide at least one contact field (email or phone).`);
        continue;
      }
      if (email && !z.string().email().safeParse(email).success) {
        errors.push(`Row ${rowNumber}: Email is invalid.`);
        continue;
      }

      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const customerData = customerSnapshotFromInput({
        firstName,
        lastName,
        name: fullName || firstName || lastName,
        email,
        phone,
        skillLevel: normalizeSkillLevel(readRowString(row, ["skill_level", "skillLevel", "Skill Level"])),
        lessonMode: normalizeLessonMode(readRowString(row, ["lesson_mode", "lessonMode", "Lesson Mode"])),
        unitNumber: readRowString(row, ["unit_number", "unitNumber", "Unit Number"]) || null,
        houseNumber: readRowString(row, ["house_number", "houseNumber", "House Number"]),
        streetName: readRowString(row, ["street_name", "streetName", "Street Name"]),
        streetType: readRowString(row, ["street_type", "streetType", "Street Type"]),
        suburb: readRowString(row, ["suburb", "Suburb", "city", "City"]),
        state: readRowString(row, ["state", "State"]) || "VIC",
        postcode: readRowString(row, ["postcode", "Postcode", "zip", "Zip"])
      });

      const dedupeClauses: Array<{ normalizedEmail?: string; normalizedPhone?: string }> = [];
      if (customerData.normalizedEmail) {
        // NOTE: We detect duplicates inside the upload before touching Prisma so
        // the admin gets row-level feedback instead of a generic unique error.
        if (seenNormalizedEmails.has(customerData.normalizedEmail)) {
          errors.push(`Row ${rowNumber}: Duplicate email in import payload.`);
          continue;
        }
        dedupeClauses.push({ normalizedEmail: customerData.normalizedEmail });
      }
      if (customerData.normalizedPhone) {
        if (seenNormalizedPhones.has(customerData.normalizedPhone)) {
          errors.push(`Row ${rowNumber}: Duplicate phone in import payload.`);
          continue;
        }
        dedupeClauses.push({ normalizedPhone: customerData.normalizedPhone });
      }
      if (dedupeClauses.length === 0) {
        errors.push(`Row ${rowNumber}: Contact details could not be normalized.`);
        continue;
      }

      const existingCustomer = await prisma.customer.findFirst({
        where: {
          isArchived: false,
          OR: dedupeClauses
        },
        select: {
          fullName: true
        }
      });
      if (existingCustomer) {
        // RATIONALE: Matching active customers are treated as a recoverable
        // import error rather than merged automatically. Silent merges here
        // would risk overwriting the wrong family/student profile.
        errors.push(`Row ${rowNumber}: Matching customer already exists (${existingCustomer.fullName}).`);
        continue;
      }

      const created = await prisma.customer.create({
        data: {
          ...customerData,
          isArchived: false
        },
        select: {
          id: true
        }
      });

      createdCustomerIds.push(created.id);
      if (customerData.normalizedEmail) {
        seenNormalizedEmails.add(customerData.normalizedEmail);
      }
      if (customerData.normalizedPhone) {
        seenNormalizedPhones.add(customerData.normalizedPhone);
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: createdCustomerIds.length,
      // NOTE: Partial success is intentional. Admins can fix only the rejected
      // rows and re-run the import without losing successfully created entries.
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Customer import failed.");
  }
}
