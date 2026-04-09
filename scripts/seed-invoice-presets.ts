import { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaMariaDbAdapter, getRequiredDatabaseUrl } from "../src/lib/prisma-mariadb";

const prisma = new PrismaClient({
  adapter: createPrismaMariaDbAdapter(getRequiredDatabaseUrl())
});

const PRESETS = [
  {
    id: "trial_30min",
    label: "30min Trial Lesson ($20)",
    description: "30min Trial Lesson",
    unitPriceCents: 2000,
    sortOrder: 10
  },
  {
    id: "pack_5x30",
    label: "5 × 30 Minute Lessons ($200)",
    description: "5 × 30 Minute Lessons",
    unitPriceCents: 20000,
    sortOrder: 20
  },
  {
    id: "pack_10x30",
    label: "10 × 30 Minute Lessons ($388)",
    description: "10 × 30 Minute Lessons",
    unitPriceCents: 38800,
    sortOrder: 30
  },
  {
    id: "pack_5x60",
    label: "5 × 1 Hour Lessons ($375)",
    description: "5 × 1 Hour Lessons",
    unitPriceCents: 37500,
    sortOrder: 40
  },
  {
    id: "pack_10x60",
    label: "10 × 1 Hour Lessons ($725)",
    description: "10 × 1 Hour Lessons",
    unitPriceCents: 72500,
    sortOrder: 50
  }
];

async function main() {
  console.log("Seeding invoice product presets...");

  for (const preset of PRESETS) {
    await prisma.invoiceProductPreset.upsert({
      where: { id: preset.id },
      update: {
        label: preset.label,
        description: preset.description,
        unitPriceCents: preset.unitPriceCents,
        sortOrder: preset.sortOrder,
        isActive: true
      },
      create: {
        id: preset.id,
        label: preset.label,
        description: preset.description,
        unitPriceCents: preset.unitPriceCents,
        sortOrder: preset.sortOrder,
        isActive: true
      }
    });
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
