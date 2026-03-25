#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

const projectRoot = process.cwd();
const checklistPath = path.join(projectRoot, "Documentation", "assets", "SCREENSHOT_SEED_CHECKLIST.md");
const learningMaterialsRoot = path.join(projectRoot, ".data", "learning-materials");
const DEFAULT_LESSON_PRICING = [
  { durationMinutes: 30, priceCents: 5000, isActive: true, sortOrder: 0 },
  { durationMinutes: 60, priceCents: 9000, isActive: true, sortOrder: 1 },
  { durationMinutes: 120, priceCents: 17000, isActive: true, sortOrder: 2 }
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

/** Normalizes names into the same search form used by the live app. */
function normalizeName(value: any) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Builds a deduplicated token string for customer name search helpers. */
function buildNameTokens(value: any) {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  return [...new Set(normalized.split(" ").filter(Boolean))].join(" ");
}

/** Lowercases emails so screenshot fixtures behave like production matching. */
function normalizeEmail(value: any) {
  return String(value || "").trim().toLowerCase();
}

/** Strips punctuation/spaces from phone numbers for matching and seeding. */
function normalizePhone(value: any) {
  return String(value || "").replace(/\D/g, "");
}

/** Derives a 32-byte AES key from whichever secret is available in the env. */
function deriveEncryptionKey(secret: any) {
  const trimmed = String(secret || "").trim();
  if (!trimmed) throw new Error("Missing encryption secret");
  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
}

/**
 * Mirrors the app's student-portal password encryption format so seeded demo
 * credentials can be revealed and rotated through the real admin workflows.
 */
function encryptPortalSecret(plaintext: any) {
  const explicit = process.env.STUDENT_PORTAL_PASSWORD_ENCRYPTION_KEY?.trim();
  const fallback = process.env.ADMIN_SESSION_SECRET || "dev-student-portal-encryption-key";
  const key = deriveEncryptionKey(explicit || fallback);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

/**
 * Writes the operator checklist consumed by the docs screenshot workflow.
 *
 * RATIONALE: The screenshots are only reproducible when the seed, app, and
 * capture run against the same disposable database, so the script leaves a
 * lightweight reminder next to the documentation assets.
 */
function writeChecklist() {
  const checklist = `# Screenshot Seed Checklist

This project includes a deterministic screenshot seeder.

## Recommended Flow
1. Start a disposable MySQL database.
2. Run Prisma migrations against that DB.
3. Run \`npm run docs:screenshots:seed\` with the same \`DATABASE_URL\`.
4. Start the app with the same DB URL and screenshot admin credentials.
5. Run \`npm run docs:screenshots\` and then \`npm run docs:screenshots:sync\`.

## Required Environment (seed command)
- \`DATABASE_URL\` (must be \`mysql://...\`)

## Optional Environment (defaults provided)
- \`DOCS_SCREENSHOTS_ADMIN_EMAIL\`
- \`DOCS_SCREENSHOTS_ADMIN_PASSWORD\`
- \`DOCS_SCREENSHOTS_STUDENT_PASSWORD\`
`;
  fs.writeFileSync(checklistPath, checklist, "utf8");
  console.log(`Wrote screenshot seed checklist to ${path.relative(projectRoot, checklistPath)}`);
}

/** Writes deterministic placeholder files into the local learning-material store. */
function writeDemoMaterial(relativePath: string, content: Buffer | string) {
  const absolutePath = path.join(learningMaterialsRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

/** Converts dollar amounts into the integer cent values stored in the DB. */
function cents(amount: any) {
  return Math.round(amount * 100);
}

/** Reassembles an address string from the normalized customer fields. */
function makeAddress(input: any) {
  const unit = input.unitNumber ? `${input.unitNumber}/` : "";
  return `${unit}${input.houseNumber} ${input.streetName} ${input.streetType}, ${input.suburb} ${input.state} ${input.postcode}`.trim();
}

/** Mirrors invoice line calculations used by the app so screenshots show valid totals. */
function lineCalc(quantity: any, unitPriceCents: any, taxMode: any) {
  const subtotal = quantity * unitPriceCents;
  const gst = taxMode === "taxable" ? Math.round(subtotal / 11) : 0;
  return {
    lineSubtotalCents: subtotal,
    lineGstCents: gst,
    lineTotalCents: subtotal + gst
  };
}

/** Convenience helper for creating booking end-times from a start date. */
function addMinutes(date: any, minutes: any) {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Creates demo-relative dates while preserving readable fixture intent. */
function daysFromNow(days: any, hour: any, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Seeds a fully navigable demo environment for manual screenshots and docs
 * capture, including admin auth, customers, bookings, portal credentials,
 * materials, invoices, and email history.
 */
async function seed() {
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl.startsWith("mysql://")) {
    throw new Error("DATABASE_URL must be a mysql:// URL for docs screenshot seeding.");
  }

  const adminEmail = normalizeEmail(process.env.DOCS_SCREENSHOTS_ADMIN_EMAIL || "owner@example.com");
  const adminPassword = process.env.DOCS_SCREENSHOTS_ADMIN_PASSWORD || "DocsDemoAdmin!23";
  const studentPassword = process.env.DOCS_SCREENSHOTS_STUDENT_PASSWORD || "StudentDemo!23";
  const now = new Date();

  try {
    console.log("Resetting docs demo data...");
    // RATIONALE: Delete in dependency order so the script can be rerun on the
    // same disposable database without manual cleanup between screenshot passes.
    await prisma.$transaction([
      prisma.lessonPricingOption.deleteMany({}),
      prisma.lessonPlan.deleteMany({}),
      prisma.lessonPlanTemplate.deleteMany({}),
      prisma.invoiceAuditLog.deleteMany({}),
      prisma.invoiceLineItem.deleteMany({}),
      prisma.invoice.deleteMany({}),
      prisma.outboundEmail.deleteMany({}),
      prisma.learningMaterial.deleteMany({}),
      prisma.customerPortalCredentialAuditLog.deleteMany({}),
      prisma.customerPortalCredential.deleteMany({}),
      prisma.bookingAuditLog.deleteMany({}),
      prisma.booking.deleteMany({}),
      prisma.bookingSeries.deleteMany({}),
      prisma.bookingRequest.deleteMany({}),
      prisma.contactSubmission.deleteMany({}),
      prisma.customer.deleteMany({}),
      prisma.adminUser.deleteMany({})
    ]);

    await prisma.lessonPricingOption.createMany({
      data: DEFAULT_LESSON_PRICING
    });

    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        displayName: "Docs Demo Admin",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        isActive: true
      }
    });

    const teacher = await prisma.adminUser.create({
      data: {
        email: "tayla.teacher@example.com",
        role: "teacher",
        firstName: "Tayla",
        lastName: "Rhodes",
        displayName: "Tayla Rhodes",
        passwordHash: await bcrypt.hash("DocsDemoTeacher!23", 12),
        age: 31,
        houseNumber: "22",
        streetName: "Nicholson",
        streetType: "Street",
        suburb: "Brunswick East",
        state: "VIC",
        postcode: "3057",
        instruments: "Guitar, Songwriting, Beginner Piano",
        specialisations: "Beginner coaching, Acoustic rhythm, Teenage students",
        background: "Touring songwriter and studio coach focused on practical weekly progress.",
        musicalHistory: "Over 12 years teaching private students and small group workshops.",
        isActive: true
      }
    });

    const customer1 = await prisma.customer.create({
      data: {
        fullName: "Alex Student",
        normalizedFullName: normalizeName("Alex Student"),
        nameSearchTokens: buildNameTokens("Alex Student"),
        email: "alex.student@example.com",
        normalizedEmail: normalizeEmail("alex.student@example.com"),
        phone: "0412345678",
        normalizedPhone: normalizePhone("0412345678"),
        skillLevel: "beginner",
        lessonMode: "in_person",
        houseNumber: "12",
        streetName: "King",
        streetType: "Street",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
        primaryTeacherId: teacher.id
      }
    });

    const customer2 = await prisma.customer.create({
      data: {
        fullName: "Jamie Guitar",
        normalizedFullName: normalizeName("Jamie Guitar"),
        nameSearchTokens: buildNameTokens("Jamie Guitar"),
        email: "jamie.guitar@example.com",
        normalizedEmail: normalizeEmail("jamie.guitar@example.com"),
        phone: "0498765432",
        normalizedPhone: normalizePhone("0498765432"),
        skillLevel: "intermediate",
        lessonMode: "video",
        houseNumber: "88",
        streetName: "Lygon",
        streetType: "Street",
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
        primaryTeacherId: teacher.id
      }
    });

    const pendingRequest = await prisma.bookingRequest.create({
      data: {
        status: "pending",
        name: customer1.fullName,
        email: customer1.email,
        phone: customer1.phone,
        address: makeAddress(customer1),
        houseNumber: customer1.houseNumber,
        streetName: customer1.streetName,
        streetType: customer1.streetType,
        suburb: customer1.suburb,
        state: customer1.state,
        postcode: customer1.postcode,
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: daysFromNow(2, 16, 0),
        notes: "After-school lesson request",
        customerId: customer1.id,
        assignedTeacherId: teacher.id
      }
    });

    await prisma.bookingRequest.create({
      data: {
        status: "rejected",
        name: customer2.fullName,
        email: customer2.email,
        phone: customer2.phone,
        address: makeAddress(customer2),
        houseNumber: customer2.houseNumber,
        streetName: customer2.streetName,
        streetType: customer2.streetType,
        suburb: customer2.suburb,
        state: customer2.state,
        postcode: customer2.postcode,
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        requestedStartAt: daysFromNow(-1, 18, 30),
        notes: "Rejected due to availability",
        customerId: customer2.id,
        assignedTeacherId: teacher.id
      }
    });

    await prisma.bookingRequest.create({
      data: {
        status: "cancelled",
        name: "Taylor Parent",
        email: "taylor.parent@example.com",
        phone: "0400111222",
        address: "10 Collins Street, Melbourne VIC 3000",
        houseNumber: "10",
        streetName: "Collins",
        streetType: "Street",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        requestedStartAt: daysFromNow(-1, 15, 0),
        notes: "Cancelled by family"
      }
    });

    const approvedRequest = await prisma.bookingRequest.create({
      data: {
        status: "approved",
        name: customer1.fullName,
        email: customer1.email,
        phone: customer1.phone,
        address: makeAddress(customer1),
        houseNumber: customer1.houseNumber,
        streetName: customer1.streetName,
        streetType: customer1.streetType,
        suburb: customer1.suburb,
        state: customer1.state,
        postcode: customer1.postcode,
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        requestedStartAt: daysFromNow(-10, 17, 0),
        approvedById: admin.id,
        customerId: customer1.id,
        assignedTeacherId: teacher.id
      }
    });

    const upcomingBooking = await prisma.booking.create({
      data: {
        status: "approved",
        name: customer1.fullName,
        email: customer1.email,
        phone: customer1.phone,
        address: makeAddress(customer1),
        houseNumber: customer1.houseNumber,
        streetName: customer1.streetName,
        streetType: customer1.streetType,
        suburb: customer1.suburb,
        state: customer1.state,
        postcode: customer1.postcode,
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: daysFromNow(1, 16, 0),
        endAt: addMinutes(daysFromNow(1, 16, 0), 60),
        timezone: "Australia/Melbourne",
        notes: "Bring practice notebook",
        customerId: customer1.id,
        modifiedById: admin.id,
        requestId: pendingRequest.id,
        assignedTeacherId: teacher.id
      }
    });

    const pastBooking = await prisma.booking.create({
      data: {
        status: "approved",
        name: customer2.fullName,
        email: customer2.email,
        phone: customer2.phone,
        address: makeAddress(customer2),
        houseNumber: customer2.houseNumber,
        streetName: customer2.streetName,
        streetType: customer2.streetType,
        suburb: customer2.suburb,
        state: customer2.state,
        postcode: customer2.postcode,
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min30",
        startAt: daysFromNow(-5, 18, 0),
        endAt: addMinutes(daysFromNow(-5, 18, 0), 30),
        timezone: "Australia/Melbourne",
        notes: "Focus on chord transitions",
        customerId: customer2.id,
        modifiedById: admin.id,
        requestId: approvedRequest.id,
        assignedTeacherId: teacher.id
      }
    });

    const portalSummaryBooking = await prisma.booking.create({
      data: {
        status: "approved",
        name: customer1.fullName,
        email: customer1.email,
        phone: customer1.phone,
        address: makeAddress(customer1),
        houseNumber: customer1.houseNumber,
        streetName: customer1.streetName,
        streetType: customer1.streetType,
        suburb: customer1.suburb,
        state: customer1.state,
        postcode: customer1.postcode,
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: daysFromNow(-3, 16, 0),
        endAt: addMinutes(daysFromNow(-3, 16, 0), 60),
        timezone: "Australia/Melbourne",
        notes: "Reviewed open chords and first strumming pattern.",
        customerId: customer1.id,
        modifiedById: teacher.id,
        assignedTeacherId: teacher.id
      }
    });

    await prisma.booking.create({
      data: {
        status: "cancelled",
        name: customer1.fullName,
        email: customer1.email,
        phone: customer1.phone,
        address: makeAddress(customer1),
        houseNumber: customer1.houseNumber,
        streetName: customer1.streetName,
        streetType: customer1.streetType,
        suburb: customer1.suburb,
        state: customer1.state,
        postcode: customer1.postcode,
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        startAt: daysFromNow(-2, 16, 30),
        endAt: addMinutes(daysFromNow(-2, 16, 30), 30),
        timezone: "Australia/Melbourne",
        cancelledAt: daysFromNow(-2, 10, 0),
        customerId: customer1.id,
        modifiedById: admin.id,
        assignedTeacherId: teacher.id
      }
    });

    // Add previous-month and previous-year paid bookings to strengthen report comparisons.
    await prisma.booking.create({
      data: {
        status: "approved",
        name: customer2.fullName,
        email: customer2.email,
        phone: customer2.phone,
        address: makeAddress(customer2),
        houseNumber: customer2.houseNumber,
        streetName: customer2.streetName,
        streetType: customer2.streetType,
        suburb: customer2.suburb,
        state: customer2.state,
        postcode: customer2.postcode,
        lessonMode: "video",
        skillLevel: "intermediate",
        lessonDuration: "min60",
        startAt: new Date(now.getFullYear(), now.getMonth() - 1, 10, 17, 0, 0, 0),
        endAt: new Date(now.getFullYear(), now.getMonth() - 1, 10, 18, 0, 0, 0),
        timezone: "Australia/Melbourne",
        customerId: customer2.id,
        modifiedById: admin.id,
        assignedTeacherId: teacher.id
      }
    });

    await prisma.booking.create({
      data: {
        status: "approved",
        name: customer1.fullName,
        email: customer1.email,
        phone: customer1.phone,
        address: makeAddress(customer1),
        houseNumber: customer1.houseNumber,
        streetName: customer1.streetName,
        streetType: customer1.streetType,
        suburb: customer1.suburb,
        state: customer1.state,
        postcode: customer1.postcode,
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min30",
        startAt: new Date(now.getFullYear() - 1, 6, 14, 15, 30, 0, 0),
        endAt: new Date(now.getFullYear() - 1, 6, 14, 16, 0, 0, 0),
        timezone: "Australia/Melbourne",
        customerId: customer1.id,
        modifiedById: admin.id,
        assignedTeacherId: teacher.id
      }
    });

    await prisma.bookingAuditLog.createMany({
      data: [
        { bookingId: upcomingBooking.id, action: "edited", actorId: admin.id, details: "Demo seed booking" },
        { bookingId: pastBooking.id, action: "approved", actorId: admin.id, details: "Demo seed approved booking" },
        { bookingId: portalSummaryBooking.id, action: "edited", actorId: teacher.id, details: "Demo lesson-plan summary booking" }
      ]
    });

    const foundationalTemplate = await prisma.lessonPlanTemplate.create({
      data: {
        title: "Foundations Follow-Up",
        description: "Reusable beginner structure for chord changes, rhythm recall, and take-home practice.",
        lessonFocus: "Posture, open-chord recall, and clean transitions",
        goals: "Keep a steady four-count strum and change between G, C, and D without stopping.",
        activities: "Warm-up, guided transition drill, slow strumming loop, and one short song fragment.",
        homework: "Practice the G-C-D loop for five minutes a day and play the assigned chorus twice.",
        sharedNotes: "Keep fretting fingers close to the strings between changes to avoid losing time.",
        privateNotes: "Student responds best to call-and-response counting before independent strumming.",
        createdById: teacher.id,
        updatedById: teacher.id
      }
    });

    await prisma.lessonPlan.create({
      data: {
        bookingId: upcomingBooking.id,
        sourceTemplateId: foundationalTemplate.id,
        lessonFocus: "Open-chord revision before introducing Em",
        goals: "Stabilize the G-C-D progression and prepare the student for the next chord family.",
        activities: "Review last week's progression, one-bar count-in drills, and slower chorus play-throughs.",
        homework: "Repeat the warm-up loop daily and record one clean G-C-D cycle for the next lesson.",
        sharedNotes: "Use the written count aloud before each change so the transition stays even.",
        privateNotes: "Keep the next lesson on rhythm confidence unless the current homework is mastered.",
        createdById: teacher.id,
        updatedById: teacher.id
      }
    });

    await prisma.lessonPlan.create({
      data: {
        bookingId: portalSummaryBooking.id,
        sourceTemplateId: foundationalTemplate.id,
        lessonFocus: "Chord changes with consistent down-strums",
        goals: "Move between G, C, and D while keeping the beat steady for one full verse.",
        activities: "Used the four-count lead-in, repeated chord-pair changes, then played a short song section.",
        homework: "Practice the verse loop three times per day and pause only after finishing each full cycle.",
        sharedNotes: "Count aloud on beat one before each chord change. Your timing improved once the count stayed consistent.",
        privateNotes: "Keep next week's lesson focused on rhythm endurance before introducing faster transitions.",
        createdById: teacher.id,
        updatedById: teacher.id
      }
    });

    const studentPasswordHash = await bcrypt.hash(studentPassword, 10);
    const studentPasswordEncrypted = encryptPortalSecret(studentPassword);
    const customer1Credential = await prisma.customerPortalCredential.create({
      data: {
        customerId: customer1.id,
        passwordHash: studentPasswordHash,
        passwordEncrypted: studentPasswordEncrypted,
        isActive: true
      }
    });
    await prisma.customerPortalCredentialAuditLog.create({
      data: {
        customerId: customer1.id,
        credentialId: customer1Credential.id,
        actorId: admin.id,
        action: "generated",
        details: "Docs screenshot demo credential"
      }
    });

    await prisma.learningMaterial.createMany({
      data: [
        {
          customerId: customer1.id,
          bookingId: upcomingBooking.id,
          uploadedById: admin.id,
          title: "Warm-up Exercise Sheet",
          materialType: "pdf",
          storageKey: "docs-demo/alex/warmup-sheet.pdf",
          mimeType: "application/pdf",
          sizeBytes: 48213
        },
        {
          customerId: customer1.id,
          bookingId: null,
          uploadedById: admin.id,
          title: "Practice Backing Track",
          materialType: "audio",
          storageKey: "docs-demo/alex/backing-track.mp3",
          mimeType: "audio/mpeg",
          sizeBytes: 1250043
        }
      ]
    });

    writeDemoMaterial(
      "docs-demo/alex/warmup-sheet.pdf",
      Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8")
    );
    // NOTE: These placeholders are intentionally tiny. The screenshot workflow
    // only needs stable file metadata and a downloadable blob, not rich content.
    writeDemoMaterial("docs-demo/alex/backing-track.mp3", Buffer.from("ID3docs-demo-audio", "utf8"));

    const sellerBusinessName = process.env.INVOICE_BUSINESS_NAME || "Melbourne Guitar School";
    const sellerAbn = process.env.INVOICE_BUSINESS_ABN || "12345678901";
    const sellerEmail = process.env.SMTP_FROM || "Melbourne Guitar School <no-reply@example.com>";
    const bankName = process.env.INVOICE_BANK_NAME || "ANZ";
    const bankBsb = process.env.INVOICE_BANK_BSB || "013001";
    const bankAccountName = process.env.INVOICE_BANK_ACCOUNT_NAME || "Melbourne Guitar School";
    const bankAccountNumber = process.env.INVOICE_BANK_ACCOUNT_NUMBER || "12345678";

    async function createInvoice({
      invoiceNumber,
      status,
      customer,
      bookingId,
      issuedAt,
      dueAt,
      sentAt,
      paidAt,
      lessonDescription,
      quantity,
      unitPrice,
      taxMode,
      notes,
      lastReminderStage
    }: any) {
      const unitPriceCents = cents(unitPrice);
      const calc = lineCalc(quantity, unitPriceCents, taxMode);
      return prisma.invoice.create({
        data: {
          invoiceNumber,
          status,
          documentType: "invoice",
          taxMode,
          currency: "AUD",
          customerId: customer.id,
          bookingId: bookingId || null,
          customerName: customer.fullName,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          customerAddress: makeAddress(customer),
          sellerBusinessName,
          sellerAbn,
          sellerEmail,
          bankName,
          bankBsb,
          bankAccountName,
          bankAccountNumber,
          subtotalCents: calc.lineSubtotalCents,
          gstCents: calc.lineGstCents,
          totalCents: calc.lineTotalCents,
          notes: notes || null,
          issuedAt,
          dueAt,
          sentAt: sentAt || null,
          paidAt: paidAt || null,
          lastReminderSentAt: sentAt || null,
          lastReminderStage: lastReminderStage ?? null,
          createdById: admin.id,
          updatedById: admin.id,
          lineItems: {
            create: [
              {
                kind: "lesson",
                description: lessonDescription,
                quantity,
                unitPriceCents,
                taxMode,
                lineSubtotalCents: calc.lineSubtotalCents,
                lineGstCents: calc.lineGstCents,
                lineTotalCents: calc.lineTotalCents,
                sortOrder: 0
              }
            ]
          }
        }
      });
    }

    await createInvoice({
      invoiceNumber: "MGS-2026-0001",
      status: "draft",
      customer: customer1,
      bookingId: upcomingBooking.id,
      issuedAt: daysFromNow(0, 9, 0),
      dueAt: daysFromNow(14, 17, 0),
      lessonDescription: "5 × 30 Minute Lessons",
      quantity: 1,
      unitPrice: 200,
      taxMode: "gst_free",
      notes: "Draft demo invoice with package preset"
    });

    await createInvoice({
      invoiceNumber: "MGS-2026-0002",
      status: "sent",
      customer: customer2,
      bookingId: pastBooking.id,
      issuedAt: daysFromNow(-21, 9, 0),
      dueAt: daysFromNow(-7, 17, 0),
      sentAt: daysFromNow(-21, 10, 0),
      lessonDescription: "10 × 30 Minute Lessons",
      quantity: 1,
      unitPrice: 388,
      taxMode: "gst_free",
      notes: "Overdue invoice for reminders/reporting",
      lastReminderStage: 7
    });

    await createInvoice({
      invoiceNumber: "MGS-2026-0003",
      status: "paid",
      customer: customer1,
      bookingId: null,
      issuedAt: daysFromNow(-9, 9, 0),
      dueAt: daysFromNow(5, 17, 0),
      sentAt: daysFromNow(-9, 10, 0),
      paidAt: daysFromNow(-1, 11, 30),
      lessonDescription: "5 × 1 Hour Lessons",
      quantity: 1,
      unitPrice: 375,
      taxMode: "gst_free",
      notes: "Paid invoice for current-week/current-month earnings"
    });

    await createInvoice({
      invoiceNumber: "MGS-2026-0004",
      status: "paid",
      customer: customer2,
      bookingId: null,
      issuedAt: new Date(now.getFullYear(), now.getMonth() - 1, 5, 9, 0, 0, 0),
      dueAt: new Date(now.getFullYear(), now.getMonth() - 1, 19, 17, 0, 0, 0),
      sentAt: new Date(now.getFullYear(), now.getMonth() - 1, 5, 10, 0, 0, 0),
      paidAt: new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0, 0),
      lessonDescription: "10 × 1 Hour Lessons",
      quantity: 1,
      unitPrice: 725,
      taxMode: "gst_free",
      notes: "Previous month earnings comparison"
    });

    await createInvoice({
      invoiceNumber: "MGS-2025-0048",
      status: "paid",
      customer: customer1,
      bookingId: null,
      issuedAt: new Date(now.getFullYear() - 1, 6, 1, 9, 0, 0, 0),
      dueAt: new Date(now.getFullYear() - 1, 6, 15, 17, 0, 0, 0),
      sentAt: new Date(now.getFullYear() - 1, 6, 1, 10, 0, 0, 0),
      paidAt: new Date(now.getFullYear() - 1, 6, 10, 13, 0, 0, 0),
      lessonDescription: "Archived lesson package (year comparison)",
      quantity: 1,
      unitPrice: 450,
      taxMode: "gst_free",
      notes: "Previous year earnings comparison"
    });

    await prisma.contactSubmission.create({
      data: {
        name: "Casey Parent",
        email: "casey.parent@example.com",
        phone: "0400777888",
        message: "Interested in beginner lessons for my child."
      }
    });

    await prisma.outboundEmail.create({
      data: {
        toEmail: adminEmail,
        subject: "Docs demo seeded",
        htmlBody: "<p>Docs screenshot demo dataset created.</p>",
        status: "sent"
      }
    });

    fs.writeFileSync(
      checklistPath,
      `# Screenshot Seed Checklist\n\nLast seeded: ${new Date().toISOString()}\n\n## Demo Credentials\n- Admin email: \`${adminEmail}\`\n- Admin password: \`${adminPassword}\`\n- Student login name: \`${customer1.fullName}\`\n- Student postcode: \`${customer1.postcode}\`\n- Student password: \`${studentPassword}\`\n\n## Dataset Summary\n- Staff accounts: 2 (owner + teacher)\n- Customers: 2\n- Booking requests: 4 (pending/approved/rejected/cancelled)\n- Bookings: 5 (approved + cancelled, cross-period)\n- Invoices: 5 (draft/sent/paid + comparisons)\n- Lesson pricing rows: 3 (30 / 60 / 120 minutes)\n- Learning materials: 2 (booking-linked + general)\n`,
      "utf8"
    );

    console.log("Seeded docs screenshot demo data successfully.");
    console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
    console.log(`Student login (for portal screenshots): ${customer1.fullName} / ${customer1.postcode} / ${studentPassword}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.argv.includes("--checklist")) {
    writeChecklist();
    return;
  }
  await seed();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
