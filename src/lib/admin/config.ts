import type { AdminRole } from "@/generated/prisma/client";

export type AdminNavItem = {
  label: string;
  href: string;
  tooltip: string;
  roles?: AdminRole[];
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Bookings", href: "/admin/bookings", tooltip: "View and manage lesson schedule and booking requests." },
  { label: "Customers", href: "/admin/customers", tooltip: "View and manage student profiles and billing details." },
  { label: "Teachers", href: "/admin/teachers", tooltip: "Manage teacher accounts, profiles, and assignment defaults." },
  { label: "Lesson Plans", href: "/admin/lesson-plans", tooltip: "Create reusable lesson-plan templates and apply them from bookings." },
  { label: "Chords", href: "/admin/chords", tooltip: "Build and manage chord diagrams and chord charts.", roles: ["owner"] },
  { label: "Invoices", href: "/admin/invoices", tooltip: "Create, view, and manage financial invoices.", roles: ["owner"] },
  { label: "Reports", href: "/admin/reports", tooltip: "View business metrics and revenue reporting.", roles: ["owner"] },
  { label: "Manual", href: "/admin/manual", tooltip: "Access documentation and operational guides.", roles: ["owner"] },
  { label: "Logs", href: "/admin/system-logs", tooltip: "Audit trail of system events and background jobs.", roles: ["owner"] },
  { label: "Settings", href: "/admin/settings", tooltip: "Configure school operations and integrations.", roles: ["owner"] },
  { label: "About", href: "/admin/about", tooltip: "Review release version, developer credits, and project links.", roles: ["owner"] },
];
