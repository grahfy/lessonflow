import { Prisma } from "@/generated/prisma/client";

type AssignmentActor = {
  id: string;
  role: "owner" | "teacher";
};

type DbClient = Prisma.TransactionClient | typeof import("@/lib/db").prisma;

async function findActiveTeacherById(db: DbClient, id: string) {
  return db.adminUser.findFirst({
    where: {
      id,
      role: "teacher",
      isActive: true
    },
    select: {
      id: true
    }
  });
}

/**
 * Returns the lone active teacher when the staff roster has exactly one
 * assignable teacher. Otherwise returns null so multi-staff setups still
 * require an explicit assignment choice.
 */
export async function findSingleActiveTeacherId(db: DbClient): Promise<string | null> {
  const teachers = await db.adminUser.findMany({
    where: {
      role: "teacher",
      isActive: true
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    },
    take: 2
  });

  return teachers.length === 1 ? teachers[0]?.id ?? null : null;
}

/**
 * Best-effort assignment used by passive/default flows such as public booking
 * requests. A preferred teacher is preserved only when that teacher remains
 * active; otherwise the system falls back to the single-teacher default.
 */
export async function resolveAutoAssignedTeacherId(input: {
  db: DbClient;
  preferredTeacherId?: string | null;
}): Promise<string | null> {
  const preferredTeacherId = input.preferredTeacherId?.trim() || "";
  if (preferredTeacherId) {
    const teacher = await findActiveTeacherById(input.db, preferredTeacherId);
    if (teacher) {
      return teacher.id;
    }
  }

  return findSingleActiveTeacherId(input.db);
}

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
    return findSingleActiveTeacherId(input.db);
  }

  const teacher = await findActiveTeacherById(input.db, candidate);

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
