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

async function findActiveOwnerById(db: DbClient, id: string) {
  return db.adminUser.findFirst({
    where: {
      id,
      role: "owner",
      isActive: true
    },
    select: {
      id: true
    }
  });
}

async function countActiveTeachers(db: DbClient): Promise<number> {
  return db.adminUser.count({
    where: {
      role: "teacher",
      isActive: true
    }
  });
}

export async function findSingleActiveOwnerId(db: DbClient): Promise<string | null> {
  const owners = await db.adminUser.findMany({
    where: {
      role: "owner",
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

  return owners.length === 1 ? owners[0]?.id ?? null : null;
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
 * Returns the single assignable staff member. Teachers are preferred, but
 * when there are no active teachers the sole active owner becomes the fallback
 * assignee so single-user installs can still attach bookings/customers.
 */
export async function findSingleAssignableStaffId(db: DbClient): Promise<string | null> {
  const singleTeacherId = await findSingleActiveTeacherId(db);
  if (singleTeacherId) {
    return singleTeacherId;
  }

  const activeTeacherCount = await countActiveTeachers(db);
  if (activeTeacherCount > 0) {
    return null;
  }

  return findSingleActiveOwnerId(db);
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

    const activeTeacherCount = await countActiveTeachers(input.db);
    if (activeTeacherCount === 0) {
      const owner = await findActiveOwnerById(input.db, preferredTeacherId);
      if (owner) {
        return owner.id;
      }
    }
  }

  return findSingleAssignableStaffId(input.db);
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
    return findSingleAssignableStaffId(input.db);
  }

  const teacher = await findActiveTeacherById(input.db, candidate);
  if (teacher) {
    return teacher.id;
  }

  const activeTeacherCount = await countActiveTeachers(input.db);
  if (activeTeacherCount === 0) {
    const owner = await findActiveOwnerById(input.db, candidate);
    if (owner) {
      return owner.id;
    }
  }

  throw new Error("Selected staff member does not exist.");
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
