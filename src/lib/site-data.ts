/**
 * Navigation item structure for the public site header/footer.
 * @property href - The URL path for the navigation link
 * @property label - Display text shown to users in the navigation menu
 */
export type NavItem = {
  href: string;
  label: string;
};

/**
 * Defines the visual transition order between public pages.
 * Used by the page transition animation system to determine direction:
 * - Values < 0: backward transition (slide from left)
 * - Values > 0: forward transition (slide from right)
 * - Value = 0: no transition (fade or same-page refresh)
 * 
 * The order matters for page transition animations - moving from index 0
 * to higher indices triggers forward animations, while moving backward triggers reverse.
 */
export const publicRouteOrder = [
  "/",
  "/lessons",
  "/vouchers",
  "/teacher",
  "/videos",
  "/contact",
  "/book",
  "/terms",
  "/student/login"
] as const;

/**
 * Hero/background images for each public route.
 * UI: These images are used as full-width hero backgrounds on each page.
 * The images are fetched from Unsplash CDN and optimized for performance.
 * 
 * SECURITY NOTE: These are static URLs to external CDN. Ensure the CDN
 * is trusted and images don't contain malicious content (handled by Unsplash).
 */
export const publicHeroImageByRoute: Record<(typeof publicRouteOrder)[number], string> = {
  "/": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1300&q=80",
  "/videos": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1300&q=80",
  "/lessons": "https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=1300&q=80",
  "/teacher": "https://images.unsplash.com/photo-1524230659092-07f99a75c013?auto=format&fit=crop&w=1300&q=80",
  "/vouchers": "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=1300&q=80",
  "/contact": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1300&q=80",
  "/book": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1300&q=80",
  "/terms": "https://images.unsplash.com/photo-1519659528534-7fd733a832a0?auto=format&fit=crop&w=1300&q=80",
  "/student/login": "https://images.unsplash.com/photo-1461784121038-f088ca1e7714?auto=format&fit=crop&w=1300&q=80"
};

/**
 * Pool of visually appealing images used across the site for shared visual elements.
 * UI: Used in testimonial sections, feature showcases, and promotional content.
 * These provide consistent visual branding throughout the public-facing pages.
 */
export const sharedVisualImageUrls = [
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1516280030429-27679b3dc9cf?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1461784121038-f088ca1e7714?auto=format&fit=crop&w=600&q=80"
] as const;

/**
 * Main navigation items for the public site.
 * UI: Rendered in header and footer across all public pages.
 * Order determines visual priority in the navigation menu.
 */
export const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/lessons", label: "Lessons" },
  { href: "/vouchers", label: "Gift Vouchers" },
  { href: "/teacher", label: "Teacher" },
  { href: "/videos", label: "Videos" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms" },
  { href: "/student/login", label: "Student Portal" }
];

/**
 * Strips query strings and hash fragments from pathname.
 * UI: Used for consistent route matching in transition animations.
 */
function normalizePath(pathname: string): string {
  const [clean] = pathname.split(/[?#]/);
  return clean || "/";
}

/**
 * Determines page transition direction based on route order.
 * UI: Returns -1 (backward), 0 (none), or 1 (forward) for slide animations.
 */
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
