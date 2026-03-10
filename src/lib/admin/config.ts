export type AdminNavItem = {
  label: string;
  href: string;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Invoices", href: "/admin/invoices" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Manual", href: "/admin/manual" },
  { label: "Logs", href: "/admin/system-logs" },
  { label: "Settings", href: "/admin/settings" },
];
