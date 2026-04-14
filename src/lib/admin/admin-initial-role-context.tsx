"use client";

import { createContext, useContext, type PropsWithChildren } from "react";

import type { AdminRole } from "@/generated/prisma/client";

const AdminInitialRoleContext = createContext<AdminRole | null>(null);

/**
 * Provides the server-known admin role to client components so role-gated UI
 * (like the System nav group) can render immediately without waiting for the
 * client-side session API to respond.
 */
export function AdminInitialRoleProvider({
  role,
  children
}: PropsWithChildren<{ role: AdminRole | null }>) {
  return (
    <AdminInitialRoleContext.Provider value={role}>
      {children}
    </AdminInitialRoleContext.Provider>
  );
}

export function useInitialAdminRole(): AdminRole | null {
  return useContext(AdminInitialRoleContext);
}
