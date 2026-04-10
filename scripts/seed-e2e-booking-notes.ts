import "dotenv/config";

import { prisma } from "@/lib/db";

async function main() {
  const owner = await prisma.adminUser.findFirst({
    where: { role: "owner", isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!owner) {
    throw new Error("An active owner admin is required before seeding booking notes fixtures.");
  }

  const bookingEmail = "e2e-booking-notes-booking@example.com";
  const requestEmail = "e2e-booking-notes-request@example.com";

  await prisma.bookingRequestNoteImage.deleteMany({
    where: { bookingRequest: { email: requestEmail } },
  });
  await prisma.bookingNoteImage.deleteMany({
    where: { booking: { email: bookingEmail } },
  });
  await prisma.bookingAuditLog.deleteMany({
    where: {
      OR: [
        { booking: { email: bookingEmail } },
        { booking: { email: requestEmail } },
      ],
    },
  });
  await prisma.booking.deleteMany({
    where: { email: bookingEmail },
  });
  await prisma.bookingRequest.deleteMany({
    where: { email: requestEmail },
  });

  const bookingStartAt = new Date();
  bookingStartAt.setMinutes(0, 0, 0);
  bookingStartAt.setHours(bookingStartAt.getHours() + 1);
  const bookingEndAt = new Date(bookingStartAt.getTime() + 60 * 60 * 1000);
  const requestStartAt = new Date(bookingStartAt.getTime() + 2 * 60 * 60 * 1000);

  await prisma.booking.create({
    data: {
      firstName: "E2E",
      lastName: "Booking",
      name: "E2E Booking",
      email: bookingEmail,
      phone: "0400000100",
      address: "1 Main St",
      houseNumber: "1",
      streetName: "Main",
      streetType: "St",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      startAt: bookingStartAt,
      endAt: bookingEndAt,
      timezone: "Australia/Melbourne",
      modifiedById: owner.id,
      notes: "E2E seeded booking",
    },
  });

  await prisma.bookingRequest.create({
    data: {
      firstName: "E2E",
      lastName: "Request",
      name: "E2E Request",
      email: requestEmail,
      phone: "0400000101",
      address: "1 Main St",
      houseNumber: "1",
      streetName: "Main",
      streetType: "St",
      suburb: "Northcote",
      state: "VIC",
      postcode: "3070",
      lessonMode: "in_person",
      skillLevel: "beginner",
      lessonDuration: "min60",
      requestedStartAt: requestStartAt,
      status: "pending",
      approvedById: null,
    },
  });

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
