import { backfillLegacyStaffAssignments } from "../src/lib/admin/legacy-staff-assignment-backfill";
import { prisma } from "../src/lib/db";

async function main() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const result = await backfillLegacyStaffAssignments({
    db: prisma,
    siteUrl
  });

  if (result.status === "skipped") {
    console.log(`[legacy-staff-backfill] skipped (${result.reason}) for site URL: ${result.siteUrl || "(unset)"}`);
    return;
  }

  console.log(
    `[legacy-staff-backfill] assigned local legacy records to owner ${result.ownerId}: ` +
      `customers=${result.counts.customers}, ` +
      `bookingRequests=${result.counts.bookingRequests}, ` +
      `bookingSeries=${result.counts.bookingSeries}, ` +
      `bookings=${result.counts.bookings}`
  );
}

main()
  .catch((error) => {
    console.error("[legacy-staff-backfill] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
