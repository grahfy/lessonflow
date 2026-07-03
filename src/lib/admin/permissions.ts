import type { AdminRole } from "@/generated/prisma/client";

export type AdminPermissionActor = {
  id: string;
  role: AdminRole;
};

export function isOwner(actor: AdminPermissionActor): boolean {
  return actor.role === "owner";
}

export function isTeacher(actor: AdminPermissionActor): boolean {
  return actor.role === "teacher";
}

export function canManageAssignedTeacher(actor: AdminPermissionActor, assignedTeacherId?: string | null): boolean {
  return isOwner(actor) || (!!assignedTeacherId && assignedTeacherId === actor.id);
}

export function canManagePrimaryTeacherCustomer(actor: AdminPermissionActor, primaryTeacherId?: string | null): boolean {
  return isOwner(actor) || (!!primaryTeacherId && primaryTeacherId === actor.id);
}

export function canManageStaffAccount(actor: AdminPermissionActor, targetId: string): boolean {
  return isOwner(actor) || actor.id === targetId;
}

export function canManageLessonPlanTemplate(actor: AdminPermissionActor, createdById?: string | null): boolean {
  return isOwner(actor) || (!!createdById && createdById === actor.id);
}

/**
 * Gates the shared learning materials LIBRARY WRITE surface only.
 * The library is a flat resource all admins manage equally, so any
 * authenticated owner or teacher may create/edit/delete library items.
 *
 * SECURITY: must NEVER be used to authorize per-customer material reads —
 * that stays on the existing two-tier scoping (canManageAssignedTeacher /
 * canManagePrimaryTeacherCustomer).
 */
export function canManageLibrary(actor: AdminPermissionActor): boolean {
  return isOwner(actor) || isTeacher(actor);
}

/**
 * Gates the LIBRARY ASSIGN surface only (assigning a library item to a
 * student). Any authenticated owner or teacher may assign to any student.
 *
 * SECURITY: must NEVER be used to authorize per-customer material reads —
 * that stays on the existing two-tier scoping (canManageAssignedTeacher /
 * canManagePrimaryTeacherCustomer).
 */
export function canAssignLibraryItem(actor: AdminPermissionActor): boolean {
  return isOwner(actor) || isTeacher(actor);
}
