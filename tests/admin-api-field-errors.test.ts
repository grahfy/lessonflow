import { describe, expect, it } from "vitest";
import { z } from "zod";

import { humanizeFieldName, readApiErrorDetail, readApiFieldErrors } from "@/lib/admin/formatters";
import { createCustomerSchema, customerFieldSchemas, updateCustomerSchema } from "@/lib/customers/schema";

/** A payload the create route accepts, for one-field-at-a-time negative cases. */
const validCreateInput = {
  firstName: "Nomad",
  lastName: "Tester",
  fullName: "Nomad Tester",
  email: "nomad@example.com",
  phone: "0400123999",
  houseNumber: "10",
  streetName: "Main",
  streetType: "Street",
  suburb: "Northcote",
  state: "VIC",
  postcode: "3070"
};

function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("admin API field errors", () => {
  it("extracts the first message per field from a zod flatten() body", () => {
    const parsed = z
      .object({ email: z.string().email("Enter a valid email address.") })
      .safeParse({ email: "nope" });
    expect(parsed.success).toBe(false);

    const fieldErrors = readApiFieldErrors({
      error: "Invalid customer payload.",
      details: (parsed as { error: z.ZodError }).error.flatten()
    });

    expect(fieldErrors).toEqual({ email: "Enter a valid email address." });
  });

  it("returns no field errors when the route sent none", () => {
    expect(readApiFieldErrors({ error: "Customer not found." })).toEqual({});
    expect(readApiFieldErrors(null)).toEqual({});
  });

  it("collapses a long summary instead of listing every field", async () => {
    const fieldErrors = {
      houseNumber: ["House number is required."],
      streetName: ["Street name is required."],
      streetType: ["Street type is required."],
      suburb: ["Suburb is required."],
      postcode: ["Postcode is required."]
    };
    const detail = await readApiErrorDetail(
      jsonResponse({ error: "Invalid customer payload.", details: { formErrors: [], fieldErrors } }),
      "Unable to save customer."
    );

    expect(detail.message).toBe(
      "House number is required. Street name is required. Street type is required. And 2 more."
    );
    expect(Object.keys(detail.fieldErrors)).toHaveLength(5);
  });

  it("adds the field name to a message that does not already state it", async () => {
    // invoices/currency.ts says only "Enter a valid amount." — ambiguous on its
    // own when two money fields fail in the same request.
    const detail = await readApiErrorDetail(
      jsonResponse({
        error: "Invalid invoice payload.",
        details: {
          formErrors: [],
          fieldErrors: { unitPriceCents: ["Enter a valid amount."], discountValue: ["Enter a valid percentage."] }
        }
      }),
      "Unable to save invoice."
    );

    expect(detail.message).toBe("Unit price cents: Enter a valid amount. Discount value: Enter a valid percentage.");
  });

  it("does not repeat the field name that the message already states", async () => {
    const detail = await readApiErrorDetail(
      jsonResponse({
        error: "Invalid customer payload.",
        details: { formErrors: [], fieldErrors: { houseNumber: ["House number is required."] } }
      }),
      "Unable to save customer."
    );

    expect(detail.message).toBe("House number is required.");
  });

  it("keeps every create-route address message readable, including state and postcode", () => {
    // Regression guard: state/postcode used bare AU schemas, so omitting them
    // produced Zod's "Required". One such message suppresses the whole summary
    // line, which is the exact "Invalid customer payload." this work removes.
    const parsed = createCustomerSchema.safeParse({
      firstName: "Nomad",
      lastName: "Tester",
      fullName: "Nomad Tester",
      email: "nomad@example.com",
      phone: "0400123999"
    });
    expect(parsed.success).toBe(false);

    const fieldErrors = (parsed as { error: z.ZodError }).error.flatten().fieldErrors;
    for (const [field, messages] of Object.entries(fieldErrors)) {
      expect(messages?.[0], `${field} must read as prose`).toMatch(/[.!?]$/);
    }
    expect(fieldErrors.state?.[0]).toBe("State is required.");
    expect(fieldErrors.postcode?.[0]).toBe("Postcode is required.");
  });

  it("requires a full address on create but lets PATCH send blanks", () => {
    // The routes' own schemas, not hand-built copies: POST rejects a blank
    // address outright, PATCH accepts it so findClearedAddressFields can decide.
    expect(createCustomerSchema.safeParse({ ...validCreateInput, houseNumber: "" }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ ...validCreateInput, postcode: "" }).success).toBe(false);
    expect(createCustomerSchema.safeParse(validCreateInput).success).toBe(true);

    expect(updateCustomerSchema.safeParse({ houseNumber: "" }).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ postcode: "" }).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ state: "" }).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ postcode: "12" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ houseNumber: "a".repeat(21) }).success).toBe(false);
  });

  it("keeps PATCH's clearable fields readable when the value is invalid", () => {
    // A union reports its first branch, so `z.literal("")` must not lead — it
    // would surface Zod's "Invalid input" and one such message suppresses the
    // whole summary line.
    const parsed = updateCustomerSchema.safeParse({ state: "XYZ", postcode: "12" });
    expect(parsed.success).toBe(false);

    const fieldErrors = (parsed as { error: z.ZodError }).error.flatten().fieldErrors;
    expect(fieldErrors.state?.[0]).toBe("Select a valid Australian state.");
    expect(fieldErrors.postcode?.[0]).toBe("Postcode must be exactly 4 digits.");
    for (const [field, messages] of Object.entries(fieldErrors)) {
      expect(messages?.[0], `${field} must read as prose`).toMatch(/[.!?]$/);
    }
  });

  it("trims before applying length rules", () => {
    expect(customerFieldSchemas.firstName.safeParse("   ").success).toBe(false);
    expect(customerFieldSchemas.firstName.safeParse("  Jon  ").success).toBe(true);
  });

  it("ignores a hand-thrown ValidationError details payload", () => {
    // ValidationError.details lands in the same `details` slot but is not a
    // zod flatten(); its messages can echo caller input, so they must not be
    // promoted into the summary line.
    expect(
      readApiFieldErrors({
        error: 'Duplicate section key: "intro".',
        details: { fieldErrors: { sections: ['Duplicate section key: "intro".'] } }
      })
    ).toEqual({});
  });

  it("humanizes camelCase payload keys", () => {
    expect(humanizeFieldName("firstName")).toBe("First name");
    // A trailing id is a storage detail the admin should not read.
    expect(humanizeFieldName("primaryTeacherId")).toBe("Primary teacher");
    expect(humanizeFieldName("customer_id")).toBe("Customer");
    expect(humanizeFieldName("modifiedById")).toBe("Modified by");
    expect(humanizeFieldName("id")).toBe("Id");

    // ...but only on a real boundary. These are ordinary words that end in
    // "id"; `paidAt` is a real field key, the rest guard the general shape.
    expect(humanizeFieldName("void")).toBe("Void");
    expect(humanizeFieldName("isPaid")).toBe("Is paid");
    expect(humanizeFieldName("mark_paid")).toBe("Mark paid");
    expect(humanizeFieldName("isValid")).toBe("Is valid");
    expect(humanizeFieldName("uuid")).toBe("Uuid");
  });

  it("uses one name per field in the summary", () => {
    // The message wording and the humanized key must agree, or the admin reads
    // the field named twice ("Unit number: Unit / apartment must be …").
    const parsed = customerFieldSchemas.unitNumber.safeParse("x".repeat(21));
    expect(parsed.success).toBe(false);
    const message = (parsed as { error: z.ZodError }).error.issues[0].message;

    expect(message).toBe("Unit number must be 20 characters or fewer.");
    expect(message.toLowerCase().startsWith(humanizeFieldName("unitNumber").toLowerCase())).toBe(true);
  });

  it("replaces the generic summary with named field messages", async () => {
    const detail = await readApiErrorDetail(
      jsonResponse({
        error: "Invalid customer payload.",
        details: { formErrors: [], fieldErrors: { houseNumber: ["House number is required."] } }
      }),
      "Unable to save customer."
    );

    expect(detail.message).toBe("House number is required.");
    expect(detail.fieldErrors).toEqual({ houseNumber: "House number is required." });
  });

  it("keeps the route message when there are no field errors", async () => {
    const detail = await readApiErrorDetail(
      jsonResponse({ error: "Customer not found." }, 404),
      "Unable to save customer."
    );

    expect(detail.message).toBe("Customer not found.");
    expect(detail.fieldErrors).toEqual({});
  });

  it("keeps the route message when the field messages are raw zod defaults", async () => {
    // Most admin routes still use bare zod chains. "Subject: Required" reads
    // worse than the route's own summary, so it must not replace it.
    const detail = await readApiErrorDetail(
      jsonResponse({
        error: "Invalid email payload.",
        details: { formErrors: [], fieldErrors: { subject: ["Required"] } }
      }),
      "Unable to send email."
    );

    expect(detail.message).toBe("Invalid email payload.");
    expect(detail.fieldErrors).toEqual({ subject: "Required" });
  });

  it("falls back to the caller message on a non-JSON body", async () => {
    const detail = await readApiErrorDetail(
      new Response("", { status: 500, headers: { "Content-Type": "text/html" } }),
      "Unable to save customer."
    );

    expect(detail.message).toBe("Unable to save customer.");
  });
});
