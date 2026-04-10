import "dotenv/config";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";

async function main() {
  const email = String(process.env.E2E_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.E2E_ADMIN_PASSWORD || "");

  if (!email || !password) {
    throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (existing) {
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: {
        role: "owner",
        isActive: true,
        passwordHash,
        displayName: existing.displayName || "Owner",
        firstName: existing.firstName || "Owner",
      },
    });
  } else {
    await prisma.adminUser.create({
      data: {
        email,
        role: "owner",
        firstName: "Owner",
        displayName: "Owner",
        passwordHash,
        isActive: true,
      },
    });
  }

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
