export type NavItem = {
  href: string;
  label: string;
};

export const publicRouteOrder = [
  "/",
  "/lessons",
  "/teacher",
  "/vouchers",
  "/contact",
  "/book",
  "/terms",
  "/student/login"
] as const;

export const publicHeroImageByRoute: Record<(typeof publicRouteOrder)[number], string> = {
  "/": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1300&q=80",
  "/lessons": "https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=1300&q=80",
  "/teacher": "https://images.unsplash.com/photo-1524230659092-07f99a75c013?auto=format&fit=crop&w=1300&q=80",
  "/vouchers": "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=1300&q=80",
  "/contact": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1300&q=80",
  "/book": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1300&q=80",
  "/terms": "https://images.unsplash.com/photo-1519659528534-7fd733a832a0?auto=format&fit=crop&w=1300&q=80",
  "/student/login": "https://images.unsplash.com/photo-1461784121038-f088ca1e7714?auto=format&fit=crop&w=1300&q=80"
};

export const sharedVisualImageUrls = [
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1516280030429-27679b3dc9cf?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1461784121038-f088ca1e7714?auto=format&fit=crop&w=600&q=80"
] as const;

export const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/lessons", label: "Lessons" },
  { href: "/teacher", label: "Teacher" },
  { href: "/vouchers", label: "Gift Vouchers" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms" },
  { href: "/student/login", label: "Student Portal" }
];

function normalizePath(pathname: string): string {
  const [clean] = pathname.split(/[?#]/);
  return clean || "/";
}

export function getRouteDirection(fromPath: string, toPath: string): -1 | 0 | 1 {
  const from = normalizePath(fromPath);
  const to = normalizePath(toPath);
  const fromIndex = publicRouteOrder.indexOf(from as (typeof publicRouteOrder)[number]);
  const toIndex = publicRouteOrder.indexOf(to as (typeof publicRouteOrder)[number]);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return 0;
  }
  return toIndex > fromIndex ? 1 : -1;
}
