import type { AdminRole } from "@/generated/prisma/client";

export type AdminNavGroupKey = "business" | "education" | "system";

export type AdminNavItem = {
  label: string;
  href: string;
  tooltip: string;
  description: string;
  group: AdminNavGroupKey;
  featured?: boolean;
  roles?: AdminRole[];
};

export type AdminNavGroup = {
  key: AdminNavGroupKey;
  label: string;
  description: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    label: "Bookings",
    href: "/admin/bookings",
    tooltip: "View and manage lesson schedule and booking requests.",
    description: "Run the daily lesson schedule and booking pipeline.",
    group: "business",
    featured: true
  },
  {
    label: "Customers",
    href: "/admin/customers",
    tooltip: "View and manage student profiles and billing details.",
    description: "Maintain student records, contact details, and history.",
    group: "business"
  },
  {
    label: "Invoices",
    href: "/admin/invoices",
    tooltip: "Create, view, and manage financial invoices.",
    description: "Handle billing, payment follow-up, and invoice documents.",
    group: "business",
    roles: ["owner"]
  },
  {
    label: "Reports",
    href: "/admin/reports",
    tooltip: "View business metrics and revenue reporting.",
    description: "Review operational performance and revenue trends.",
    group: "business",
    roles: ["owner"]
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    tooltip: "View public website traffic and visitor trends.",
    description: "Monitor page views, referrers, and visitor geography.",
    group: "business",
    roles: ["owner"]
  },
  {
    label: "Teachers",
    href: "/admin/teachers",
    tooltip: "Manage teacher accounts, profiles, and assignment defaults.",
    description: "Manage teaching staff, profiles, and assignment defaults.",
    group: "education"
  },
  {
    label: "Lesson Plans",
    href: "/admin/lesson-plans",
    tooltip: "Create reusable lesson-plan templates and apply them from bookings.",
    description: "Build and reuse lesson content for student progress.",
    group: "education",
    featured: true
  },
  {
    label: "Chords",
    href: "/admin/chords",
    tooltip: "Build and manage chord diagrams and chord charts.",
    description: "Maintain the chord library and supporting learning assets.",
    group: "education",
    roles: ["owner"]
  },
  {
    label: "Settings",
    href: "/admin/settings",
    tooltip: "Configure school operations and integrations.",
    description: "Configure operations, integrations, branding, and system behavior.",
    group: "system",
    featured: true,
    roles: ["owner"]
  },
  {
    label: "Logs",
    href: "/admin/system-logs",
    tooltip: "Audit trail of system events and background jobs.",
    description: "Inspect system events, jobs, and operational history.",
    group: "system",
    roles: ["owner"]
  },
  {
    label: "Manual",
    href: "/admin/manual",
    tooltip: "Access documentation and operational guides.",
    description: "Reference internal operating guides and support material.",
    group: "system",
    roles: ["owner"]
  },
  {
    label: "About",
    href: "/admin/about",
    tooltip: "Review release version, developer credits, and project links.",
    description: "Check release info, credits, and project references.",
    group: "system",
    roles: ["owner"]
  }
];

const ADMIN_NAV_GROUP_ORDER: AdminNavGroupKey[] = ["business", "education", "system"];

const ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroupKey, { label: string; description: string }> = {
  business: {
    label: "Business",
    description: "Run scheduling, student records, billing, and reporting."
  },
  education: {
    label: "Education",
    description: "Manage teaching staff, lesson content, and chord resources."
  },
  system: {
    label: "System",
    description: "Configure the platform, review logs, and access support material."
  }
};

export function canAdminAccessNavItem(item: AdminNavItem, role: AdminRole | null | undefined): boolean {
  if (!item.roles) {
    return true;
  }
  if (!role) {
    return false;
  }
  return item.roles.includes(role);
}

export function getVisibleAdminNavItems(role: AdminRole | null | undefined): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => canAdminAccessNavItem(item, role));
}

export function getVisibleAdminNavGroups(role: AdminRole | null | undefined): AdminNavGroup[] {
  return ADMIN_NAV_GROUP_ORDER
    .map((groupKey) => {
      const items = getVisibleAdminNavItems(role).filter((item) => item.group === groupKey);
      if (items.length === 0) {
        return null;
      }

      const groupMeta = ADMIN_NAV_GROUP_LABELS[groupKey];
      return {
        key: groupKey,
        label: groupMeta.label,
        description: groupMeta.description,
        items
      };
    })
    .filter((group): group is AdminNavGroup => Boolean(group));
}

export function getActiveAdminNavGroup(
  pathname: string,
  groups: AdminNavGroup[]
): AdminNavGroupKey | null {
  const activeItem = groups
    .flatMap((group) => group.items)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return activeItem?.group ?? null;
}
