#!/usr/bin/env node

import { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaMariaDbAdapter, getRequiredDatabaseUrl } from "../src/lib/prisma-mariadb";

const prisma = new PrismaClient({
  adapter: createPrismaMariaDbAdapter(getRequiredDatabaseUrl())
});

const DEFAULT_LESSON_PRICING = [
  { durationMinutes: 30, priceCents: 5000, isActive: true, sortOrder: 0 },
  { durationMinutes: 60, priceCents: 9000, isActive: true, sortOrder: 1 },
  { durationMinutes: 120, priceCents: 17000, isActive: true, sortOrder: 2 }
];

async function seedLessonPricing() {
  await prisma.$transaction(async (tx) => {
    await tx.lessonPricingOption.deleteMany({});
    await tx.lessonPricingOption.createMany({
      data: DEFAULT_LESSON_PRICING
    });
  });

  console.log(
    `Seeded lesson pricing options: ${DEFAULT_LESSON_PRICING.map((row) => `${row.durationMinutes}m=$${(row.priceCents / 100).toFixed(2)}`).join(", ")}`
  );
}

seedLessonPricing()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
