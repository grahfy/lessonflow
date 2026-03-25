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
