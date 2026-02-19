export type NavItem = {
  href: string;
  label: string;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/lessons", label: "Lessons" },
  { href: "/teacher", label: "Teacher" },
  { href: "/vouchers", label: "Gift Vouchers" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms" }
];
