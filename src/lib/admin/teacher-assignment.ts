import { Prisma } from "@/generated/prisma/client";

type AssignmentActor = {
  id: string;
  role: "owner" | "teacher";
};

type DbClient = Prisma.TransactionClient | typeof import("@/lib/db").prisma;

export async function resolveAssignedTeacherId(input: {
  db: DbClient;
  actor: AssignmentActor;
  requestedAssignedTeacherId?: string | null;
  fallbackTeacherId?: string | null;
}): Promise<string | null> {
  if (input.actor.role === "teacher") {
    return input.actor.id;
  }

  const candidate = input.requestedAssignedTeacherId?.trim() || input.fallbackTeacherId?.trim() || "";
  if (!candidate) {
    return null;
  }

  const teacher = await input.db.adminUser.findFirst({
    where: {
      id: candidate,
      role: "teacher",
      isActive: true
    },
    select: {
      id: true
    }
  });

  if (!teacher) {
    throw new Error("Selected teacher does not exist.");
  }

  return teacher.id;
}

export async function ensureCustomerPrimaryTeacher(input: {
  db: DbClient;
  customerId: string | null;
  assignedTeacherId: string | null;
}) {
  if (!input.customerId || !input.assignedTeacherId) {
    return;
  }

  await input.db.customer.updateMany({
    where: {
      id: input.customerId,
      primaryTeacherId: null
    },
    data: {
      primaryTeacherId: input.assignedTeacherId
    }
  });
}
