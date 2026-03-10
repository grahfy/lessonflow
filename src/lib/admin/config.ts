export type AdminNavItem = {
  label: string;
  href: string;
  tooltip: string;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Bookings", href: "/admin/bookings", tooltip: "View and manage lesson schedule and booking requests." },
  { label: "Customers", href: "/admin/customers", tooltip: "View and manage student profiles and billing details." },
  { label: "Invoices", href: "/admin/invoices", tooltip: "Create, view, and manage financial invoices." },
  { label: "Reports", href: "/admin/reports", tooltip: "View business metrics and revenue reporting." },
  { label: "Manual", href: "/admin/manual", tooltip: "Access documentation and operational guides." },
  { label: "Logs", href: "/admin/system-logs", tooltip: "Audit trail of system events and background jobs." },
  { label: "Settings", href: "/admin/settings", tooltip: "Configure school operations and integrations." },
];
