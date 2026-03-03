import { prisma } from "../src/lib/db";

async function main() {
  console.log("=== Login Debug Information ===\n");

  // Check NODE_ENV
  console.log(`NODE_ENV: ${process.env.NODE_ENV || "(not set)"}`);
  console.log();

  // Check admin users
  console.log("Admin Users in Database:");
  const admins = await prisma.adminUser.findMany({
    select: {
      id: true,
      email: true,
      displayName: true,
      isActive: true,
      createdAt: true
    },
    orderBy: { createdAt: "asc" }
  });

  if (admins.length === 0) {
    console.log("  ❌ No admin users found!");
    console.log("  → Run: npx tsx scripts/seed-whitelabel-defaults.ts");
  } else {
    console.log(`  ✅ Found ${admins.length} admin user(s):\n`);
    admins.forEach((admin, i) => {
      console.log(`  ${i + 1}. Email: ${admin.email}`);
      console.log(`     Display Name: ${admin.displayName}`);
      console.log(`     Active: ${admin.isActive ? "Yes" : "No"}`);
      console.log(`     Created: ${admin.createdAt.toISOString()}`);
      console.log();
    });
  }

  // Check setup status (setup is complete if there's at least one admin user)
  console.log("Setup Status:");
  if (admins.length > 0) {
    console.log("  ✅ Setup is complete (admin user exists)");
  } else {
    console.log("  ⚠️  Setup is NOT complete");
    console.log("  → Visit /setup to initialize the application");
  }
  console.log();

  // Check environment variables
  console.log("Environment Variables:");
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? "✅ Set" : "❌ Not set"}`);
  console.log(`  ADMIN_SESSION_SECRET: ${process.env.ADMIN_SESSION_SECRET ? "✅ Set" : "❌ Not set"}`);
  console.log();

  console.log("=== End Debug Information ===");

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
