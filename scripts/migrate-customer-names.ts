import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

/**
 * Split name logic consistent with UI behavior.
 */
function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";
  return { firstName, lastName };
}

async function migrate() {
  const adapter = new PrismaMariaDb(connectionString!);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("Starting data migration for customer names...");

    // 1. Customer
    const customers = await prisma.customer.findMany({
      where: { OR: [{ firstName: "" }, { lastName: "" }] }
    });
    console.log(`Migrating ${customers.length} customers...`);
    for (const c of customers) {
      const { firstName, lastName } = splitName(c.fullName);
      await prisma.customer.update({
        where: { id: c.id },
        data: { firstName, lastName }
      });
    }

    // 2. Booking
    const bookings = await prisma.booking.findMany({
      where: { OR: [{ firstName: "" }, { lastName: "" }] }
    });
    console.log(`Migrating ${bookings.length} bookings...`);
    for (const b of bookings) {
      const { firstName, lastName } = splitName(b.name);
      await prisma.booking.update({
        where: { id: b.id },
        data: { firstName, lastName }
      });
    }

    // 3. BookingRequest
    const requests = await prisma.bookingRequest.findMany({
      where: { OR: [{ firstName: "" }, { lastName: "" }] }
    });
    console.log(`Migrating ${requests.length} booking requests...`);
    for (const r of requests) {
      const { firstName, lastName } = splitName(r.name);
      await prisma.bookingRequest.update({
        where: { id: r.id },
        data: { firstName, lastName }
      });
    }

    // 4. BookingSeries
    const series = await prisma.bookingSeries.findMany({
      where: { OR: [{ firstName: "" }, { lastName: "" }] }
    });
    console.log(`Migrating ${series.length} booking series...`);
    for (const s of series) {
      const { firstName, lastName } = splitName(s.name);
      await prisma.bookingSeries.update({
        where: { id: s.id },
        data: { firstName, lastName }
      });
    }

    // 5. Invoice
    const invoices = await prisma.invoice.findMany({
      where: { OR: [{ customerFirstName: "" }, { customerLastName: "" }] }
    });
    console.log(`Migrating ${invoices.length} invoices...`);
    for (const i of invoices) {
      const { firstName, lastName } = splitName(i.customerName);
      await prisma.invoice.update({
        where: { id: i.id },
        data: { customerFirstName: firstName, customerLastName: lastName }
      });
    }

    console.log("Data migration complete successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrate().catch(e => {
  console.error(e);
  process.exit(1);
});
