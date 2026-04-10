import "dotenv/config";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { customerSnapshotFromInput, normalizeEmail, normalizePhone } from "@/lib/customer-match";
import { encryptPortalSecret } from "@/lib/student-portal/crypto";

async function main() {
  const fullName = String(process.env.E2E_STUDENT_FULL_NAME || "").trim();
  const postcode = String(process.env.E2E_STUDENT_POSTCODE || "").trim();
  const password = String(process.env.E2E_STUDENT_PASSWORD || "");

  if (!fullName || !postcode || !password) {
    throw new Error("E2E_STUDENT_FULL_NAME, E2E_STUDENT_POSTCODE, and E2E_STUDENT_PASSWORD are required.");
  }

  const now = new Date();
  const upcomingStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  upcomingStart.setMinutes(0, 0, 0);
  const upcomingEnd = new Date(upcomingStart.getTime() + 60 * 60 * 1000);

  const previousStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  previousStart.setMinutes(0, 0, 0);
  const previousEnd = new Date(previousStart.getTime() + 60 * 60 * 1000);

  const customerPayload = customerSnapshotFromInput({
    name: fullName,
    email: "student.mobile.e2e@example.com",
    phone: "0400001234",
    skillLevel: "beginner",
    lessonMode: "in_person",
    houseNumber: "12",
    streetName: "Demo",
    streetType: "Street",
    suburb: "Northcote",
    state: "VIC",
    postcode
  });

  const existingCustomer = await prisma.customer.findFirst({
    where: {
      normalizedEmail: normalizeEmail(customerPayload.email)
    },
    include: {
      portalCredential: true
    }
  });

  const customer = existingCustomer
    ? await prisma.customer.update({
        where: { id: existingCustomer.id },
        data: {
          ...customerPayload,
          fullName,
          normalizedEmail: normalizeEmail(customerPayload.email),
          normalizedPhone: normalizePhone(customerPayload.phone),
          isArchived: false
        },
        include: {
          portalCredential: true
        }
      })
    : await prisma.customer.create({
        data: {
          ...customerPayload,
          fullName,
          normalizedEmail: normalizeEmail(customerPayload.email),
          normalizedPhone: normalizePhone(customerPayload.phone),
          isArchived: false
        },
        include: {
          portalCredential: true
        }
      });

  const passwordHash = await bcrypt.hash(password, 10);
  const passwordEncrypted = encryptPortalSecret(password);

  if (customer.portalCredential) {
    await prisma.customerPortalCredential.update({
      where: { id: customer.portalCredential.id },
      data: {
        passwordHash,
        passwordEncrypted,
        isActive: true
      }
    });
  } else {
    await prisma.customerPortalCredential.create({
      data: {
        customerId: customer.id,
        passwordHash,
        passwordEncrypted,
        isActive: true
      }
    });
  }

  const existingUpcomingBooking = await prisma.booking.findFirst({
    where: {
      customerId: customer.id,
      startAt: {
        gte: now
      }
    }
  });

  if (!existingUpcomingBooking) {
    await prisma.booking.create({
      data: {
        customerId: customer.id,
        firstName: fullName.split(" ")[0] || fullName,
        lastName: fullName.split(" ").slice(1).join(" "),
        name: fullName,
        email: customer.email,
        phone: customer.phone,
        address: "12 Demo Street, Northcote VIC",
        houseNumber: customer.houseNumber,
        streetName: customer.streetName,
        streetType: customer.streetType,
        suburb: customer.suburb,
        state: customer.state,
        postcode: customer.postcode,
        lessonMode: "in_person",
        skillLevel: "beginner",
        lessonDuration: "min60",
        startAt: upcomingStart,
        endAt: upcomingEnd,
        timezone: "Australia/Melbourne",
        notes: "Student mobile e2e fixture booking"
      }
    });
  }

  const previousBooking = await prisma.booking.findFirst({
    where: {
      customerId: customer.id,
      startAt: {
        lt: now
      }
    }
  }) ?? await prisma.booking.create({
    data: {
      customerId: customer.id,
      firstName: fullName.split(" ")[0] || fullName,
      lastName: fullName.split(" ").slice(1).join(" "),
      name: fullName,
      email: customer.email,
      phone: customer.phone,
      address: "12 Demo Street, Northcote VIC",
      houseNumber: customer.houseNumber,
      streetName: customer.streetName,
      streetType: customer.streetType,
      suburb: customer.suburb,
      state: customer.state,
      postcode: customer.postcode,
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      startAt: previousStart,
      endAt: previousEnd,
      timezone: "Australia/Melbourne",
      notes: "Student mobile e2e previous booking"
    }
  });

  const materialStorageKey = `e2e/student-mobile/${customer.id}/warmup-sheet.pdf`;
  const existingMaterial = await prisma.learningMaterial.findFirst({
    where: {
      customerId: customer.id,
      storageKey: materialStorageKey
    }
  });

  if (!existingMaterial) {
    await prisma.learningMaterial.create({
      data: {
        customerId: customer.id,
        bookingId: previousBooking.id,
        title: "Student Mobile Warm-up Sheet",
        description: "Fixture material for authenticated student mobile e2e checks.",
        materialType: "pdf",
        storageKey: materialStorageKey,
        mimeType: "application/pdf",
        sizeBytes: 512
      }
    });
  }

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
