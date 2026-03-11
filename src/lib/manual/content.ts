import fs from "node:fs/promises";
import path from "node:path";

import { marked } from "marked";

/** Audience segments used to tailor the in-app manual navigation and badges. */
export type ManualAudience = "all_admins" | "technical_owner";
export type ManualSectionGroup =
  | "foundation"
  | "operations"
  | "support"
  | "configuration"
  | "diagnostics"
  | "system"
  | "technical";

export type ManualScreenshot = {
  id: string;
  fileName: string;
  publicPath: string;
  documentationPath: string;
  alt: string;
  caption: string;
};

export type ManualSectionManifest = {
  id: string;
  title: string;
  summary: string;
  group: ManualSectionGroup;
  audience: ManualAudience;
  sourcePath: string;
  relatedRoutes: string[];
  screenshotIds: string[];
};

export type AdminManualSectionIndex = ManualSectionManifest & {
  updatedAt: string;
};

export type AdminManualSection = ManualSectionManifest & {
  markdown: string;
  html: string;
  updatedAt: string;
};

export type AdminManualIndex = {
  generatedAt: string;
  sections: AdminManualSectionIndex[];
  screenshots: ManualScreenshot[];
};

/**
 * Stable screenshot registry used by both the manual UI and the Playwright
 * docs-capture workflow.
 */
export const MANUAL_SCREENSHOTS: ManualScreenshot[] = [
  {
    id: "admin-login-page",
    fileName: "admin-login-page.png",
    publicPath: "/documentation/screenshots/admin-login-page.png",
    documentationPath: "Documentation/assets/admin-login-page.png",
    alt: "Admin login page",
    caption: "Owner and staff use the admin login page to access the console."
  },
  {
    id: "booking-calendar-week-view",
    fileName: "booking-calendar-week-view.png",
    publicPath: "/documentation/screenshots/booking-calendar-week-view.png",
    documentationPath: "Documentation/assets/booking-calendar-week-view.png",
    alt: "Booking calendar week view",
    caption: "The weekly calendar combines confirmed lessons and pending requests."
  },
  {
    id: "manual-booking-dialog-customer-step",
    fileName: "manual-booking-dialog-customer-step.png",
    publicPath: "/documentation/screenshots/manual-booking-dialog-customer-step.png",
    documentationPath: "Documentation/assets/manual-booking-dialog-customer-step.png",
    alt: "Manual booking dialog customer step",
    caption: "Manual bookings can attach to an existing customer or create a new record."
  },
  {
    id: "booking-detail-dialog-notes-and-actions",
    fileName: "booking-detail-dialog-notes-and-actions.png",
    publicPath: "/documentation/screenshots/booking-detail-dialog-notes-and-actions.png",
    documentationPath: "Documentation/assets/booking-detail-dialog-notes-and-actions.png",
    alt: "Booking detail dialog actions",
    caption: "Booking detail shows edit, move, notify, materials, and billing actions."
  },
  {
    id: "booking-create-invoice-dialog",
    fileName: "booking-create-invoice-dialog.png",
    publicPath: "/documentation/screenshots/booking-create-invoice-dialog.png",
    documentationPath: "Documentation/assets/booking-create-invoice-dialog.png",
    alt: "Create invoice from booking dialog",
    caption: "A confirmed booking can open the billing flow without leaving the lesson context."
  },
  {
    id: "customer-directory-list",
    fileName: "customer-directory-list.png",
    publicPath: "/documentation/screenshots/customer-directory-list.png",
    documentationPath: "Documentation/assets/customer-directory-list.png",
    alt: "Customer directory list",
    caption: "The customer directory is the support hub for profile, portal, and billing access."
  },
  {
    id: "customer-editor-create",
    fileName: "customer-editor-create.png",
    publicPath: "/documentation/screenshots/customer-editor-create.png",
    documentationPath: "Documentation/assets/customer-editor-create.png",
    alt: "Customer create dialog",
    caption: "Customer records can be created or edited directly inside the admin console."
  },
  {
    id: "invoice-console-list-and-filters",
    fileName: "invoice-console-list-and-filters.png",
    publicPath: "/documentation/screenshots/invoice-console-list-and-filters.png",
    documentationPath: "Documentation/assets/invoice-console-list-and-filters.png",
    alt: "Invoice console list and filters",
    caption: "The invoices list highlights status, overdue balances, and follow-up candidates."
  },
  {
    id: "invoice-create-dialog",
    fileName: "invoice-create-dialog.png",
    publicPath: "/documentation/screenshots/invoice-create-dialog.png",
    documentationPath: "Documentation/assets/invoice-create-dialog.png",
    alt: "Invoice create dialog",
    caption: "Standalone and lesson-based invoice creation both begin from the invoice create dialog."
  },
  {
    id: "invoice-detail-send-and-download-pdf",
    fileName: "invoice-detail-send-and-download-pdf.png",
    publicPath: "/documentation/screenshots/invoice-detail-send-and-download-pdf.png",
    documentationPath: "Documentation/assets/invoice-detail-send-and-download-pdf.png",
    alt: "Invoice detail actions",
    caption: "Invoice detail provides send, remind, payment, and PDF actions according to status."
  },
  {
    id: "invoice-filters-outstanding-aging",
    fileName: "invoice-filters-outstanding-aging.png",
    publicPath: "/documentation/screenshots/invoice-filters-outstanding-aging.png",
    documentationPath: "Documentation/assets/invoice-filters-outstanding-aging.png",
    alt: "Invoice outstanding aging filters",
    caption: "Outstanding-only and aging filters help owners focus on overdue billing."
  },
  {
    id: "public-book-page",
    fileName: "public-book-page.png",
    publicPath: "/documentation/screenshots/public-book-page.png",
    documentationPath: "Documentation/assets/public-book-page.png",
    alt: "Public booking request page",
    caption: "New students use the public booking form to request lessons."
  },
  {
    id: "public-contact-page",
    fileName: "public-contact-page.png",
    publicPath: "/documentation/screenshots/public-contact-page.png",
    documentationPath: "Documentation/assets/public-contact-page.png",
    alt: "Public contact page",
    caption: "General enquiries arrive through the public contact form."
  },
  {
    id: "student-login-page",
    fileName: "student-login-page.png",
    publicPath: "/documentation/screenshots/student-login-page.png",
    documentationPath: "Documentation/assets/student-login-page.png",
    alt: "Student portal login page",
    caption: "Students sign in with name, postcode, and a generated portal password."
  },
  {
    id: "student-portal-page",
    fileName: "student-portal-page.png",
    publicPath: "/documentation/screenshots/student-portal-page.png",
    documentationPath: "Documentation/assets/student-portal-page.png",
    alt: "Student portal dashboard page",
    caption: "The student portal shows appointments, requests, and learning materials."
  },
  {
    id: "admin-settings-page",
    fileName: "admin-settings-page.png",
    publicPath: "/documentation/screenshots/admin-settings-page.png",
    documentationPath: "Documentation/assets/admin-settings-page.png",
    alt: "Admin settings page",
    caption: "The settings area combines branding, content, invoice, product, and system configuration."
  },
  {
    id: "admin-reports-dashboard",
    fileName: "admin-reports-dashboard.png",
    publicPath: "/documentation/screenshots/admin-reports-dashboard.png",
    documentationPath: "Documentation/assets/admin-reports-dashboard.png",
    alt: "Admin reports dashboard",
    caption: "Reports help owners review activity, overdue balances, and earnings trends."
  },
  {
    id: "system-logs-page",
    fileName: "system-logs-page.png",
    publicPath: "/documentation/screenshots/system-logs-page.png",
    documentationPath: "Documentation/assets/system-logs-page.png",
    alt: "System logs page",
    caption: "The logs page helps staff confirm recent system events and collect evidence before escalation."
  },
  {
    id: "admin-manual-page",
    fileName: "admin-manual-page.png",
    publicPath: "/documentation/screenshots/admin-manual-page.png",
    documentationPath: "Documentation/assets/admin-manual-page.png",
    alt: "Admin manual page",
    caption: "The in-app manual turns the repository docs into a navigable operator reference."
  }
];

/**
 * Canonical manual section manifest.
 *
 * RATIONALE: The app renders documentation by whitelisting explicit markdown
 * sources instead of scanning the filesystem at runtime, which keeps routing,
 * audience metadata, related routes, and screenshot mappings deterministic.
 */
export const MANUAL_SECTION_MANIFEST: ManualSectionManifest[] = [
  {
    id: "start-here-features",
    title: "Start Here and Features",
    summary: "General orientation to LessonFlow, including its major system areas, reading sequence, and operating principles.",
    group: "foundation",
    audience: "all_admins",
    sourcePath: "Documentation/01-Start-Here-and-Features.md",
    relatedRoutes: ["/admin/manual", "/admin/bookings", "/admin/settings"],
    screenshotIds: ["admin-manual-page"]
  },
  {
    id: "first-time-setup-admin-access",
    title: "First-Time Setup and Admin Access",
    summary: "Reference article covering setup state, the setup wizard, admin login, and expected session behaviour.",
    group: "foundation",
    audience: "all_admins",
    sourcePath: "Documentation/02-First-Time-Setup-and-Admin-Access.md",
    relatedRoutes: ["/setup", "/admin", "/admin/login"],
    screenshotIds: ["admin-login-page"]
  },
  {
    id: "daily-operations-booking-lifecycle",
    title: "Daily Operations and Booking Lifecycle",
    summary: "Reference guide to calendar operations, request approval, manual bookings, rescheduling, and cancellation handling.",
    group: "operations",
    audience: "all_admins",
    sourcePath: "Documentation/03-Daily-Operations-and-Booking-Lifecycle.md",
    relatedRoutes: ["/admin/bookings"],
    screenshotIds: [
      "booking-calendar-week-view",
      "manual-booking-dialog-customer-step",
      "booking-detail-dialog-notes-and-actions",
      "booking-create-invoice-dialog"
    ]
  },
  {
    id: "customers-communication-portal-support",
    title: "Customers, Communication, and Portal Support",
    summary: "Customer-directory reference covering identity maintenance, portal support, billing access, and communication history.",
    group: "support",
    audience: "all_admins",
    sourcePath: "Documentation/04-Customers-Communication-and-Portal-Support.md",
    relatedRoutes: ["/admin/customers", "/admin/bookings", "/admin/invoices"],
    screenshotIds: ["customer-directory-list", "customer-editor-create"]
  },
  {
    id: "learning-materials-notifications",
    title: "Learning Materials and Notifications",
    summary: "Reference article for staff-initiated reminders, custom email, and student-facing learning materials.",
    group: "support",
    audience: "all_admins",
    sourcePath: "Documentation/06-Learning-Materials-and-Notifications.md",
    relatedRoutes: ["/admin/bookings", "/admin/customers", "/student/portal"],
    screenshotIds: ["student-portal-page"]
  },
  {
    id: "invoicing-payments",
    title: "Invoicing and Payments",
    summary: "Billing reference covering invoice creation paths, lifecycle states, reminders, and credit-note corrections.",
    group: "operations",
    audience: "all_admins",
    sourcePath: "Documentation/05-Invoicing-and-Payments.md",
    relatedRoutes: ["/admin/invoices", "/admin/bookings"],
    screenshotIds: [
      "invoice-console-list-and-filters",
      "invoice-create-dialog",
      "invoice-detail-send-and-download-pdf",
      "invoice-filters-outstanding-aging"
    ]
  },
  {
    id: "reports-follow-up",
    title: "Reports and Follow-Up",
    summary: "Reference guide to reporting windows, console controls, and follow-up decisions based on report data.",
    group: "operations",
    audience: "all_admins",
    sourcePath: "Documentation/07-Reports-and-Follow-Up.md",
    relatedRoutes: ["/admin/reports", "/admin/invoices"],
    screenshotIds: ["admin-reports-dashboard", "invoice-filters-outstanding-aging"]
  },
  {
    id: "settings-configuration",
    title: "Settings and Configuration",
    summary: "Configuration reference covering settings tabs, shared save behaviour, and technical-owner boundaries.",
    group: "configuration",
    audience: "all_admins",
    sourcePath: "Documentation/08-Settings-and-Configuration.md",
    relatedRoutes: ["/admin/settings"],
    screenshotIds: ["admin-settings-page"]
  },
  {
    id: "logs-bug-reporting",
    title: "Logs and Bug Reporting",
    summary: "Diagnostic reference for log review, metadata interpretation, and evidence-based issue reporting.",
    group: "diagnostics",
    audience: "all_admins",
    sourcePath: "Documentation/09-Logs-and-Bug-Reporting.md",
    relatedRoutes: ["/admin/system-logs"],
    screenshotIds: ["system-logs-page"]
  },
  {
    id: "public-intake-student-portal",
    title: "Public Intake and Student Portal",
    summary: "Reference article describing public booking, contact intake, student login, and portal self-service behaviour.",
    group: "support",
    audience: "all_admins",
    sourcePath: "Documentation/10-Public-Intake-and-Student-Portal.md",
    relatedRoutes: ["/book", "/contact", "/student/login", "/student/portal"],
    screenshotIds: ["public-book-page", "public-contact-page", "student-login-page", "student-portal-page"]
  },
  {
    id: "updates-release-visibility",
    title: "Updates and Release Visibility",
    summary: "Reference guide to in-app release visibility, deployment history, and live update progress surfaces.",
    group: "system",
    audience: "all_admins",
    sourcePath: "Documentation/11-Updates-and-Release-Visibility.md",
    relatedRoutes: ["/admin/about", "/admin/updates/progress", "/admin/bookings"],
    screenshotIds: []
  },
  {
    id: "how-lessonflow-works",
    title: "How LessonFlow Works",
    summary: "High-level systems overview describing the product surfaces, data flow, and operational boundaries.",
    group: "system",
    audience: "all_admins",
    sourcePath: "Documentation/12-How-LessonFlow-Works.md",
    relatedRoutes: ["/admin/manual"],
    screenshotIds: []
  },
  {
    id: "troubleshooting-quick-reference",
    title: "Troubleshooting and Quick Reference",
    summary: "Symptom-based troubleshooting reference with first checks, escalation standards, and chapter routing.",
    group: "diagnostics",
    audience: "all_admins",
    sourcePath: "Documentation/13-Troubleshooting-and-Quick-Reference.md",
    relatedRoutes: ["/admin/system-logs", "/admin/login", "/admin/bookings"],
    screenshotIds: []
  },
  {
    id: "technical-owner-runbook",
    title: "Technical Owner Runbook",
    summary: "Technical-owner reference for VPS installation, routine updates, service verification, and recovery orientation.",
    group: "technical",
    audience: "technical_owner",
    sourcePath: "Documentation/digitalocean-admin-operations.md",
    relatedRoutes: ["/admin/updates/progress", "/admin/settings", "/admin/system-logs"],
    screenshotIds: []
  }
];

const MANIFEST_BY_ID = new Map(MANUAL_SECTION_MANIFEST.map((section) => [section.id, section]));
const SCREENSHOT_BY_ID = new Map(MANUAL_SCREENSHOTS.map((screenshot) => [screenshot.id, screenshot]));
const WHITELISTED_DOC_PATHS = new Set(MANUAL_SECTION_MANIFEST.map((section) => path.normalize(section.sourcePath)));
const DOC_BASENAME_TO_SECTION_ID = new Map(
  MANUAL_SECTION_MANIFEST.map((section) => [path.basename(section.sourcePath), section.id] as const)
);

/**
 * Rewrites markdown asset links so repo-relative docs render correctly inside
 * the app shell and cross-link to manual routes instead of raw files.
 */
function rewriteDocAssetImagePaths(markdown: string): string {
  const withImages = markdown.replace(/\((?:\.\/)?assets\/([^)]+)\)/g, "(/documentation/screenshots/$1)");

  return withImages.replace(/\(((?:Documentation\/)?[^)]+\.md)\)/g, (fullMatch, target) => {
    const fileName = path.basename(String(target));
    const sectionId = DOC_BASENAME_TO_SECTION_ID.get(fileName);
    if (!sectionId) {
      return fullMatch;
    }

    return `(/admin/manual/${sectionId})`;
  });
}

/**
 * Reads a documentation markdown file only if it was declared in the manifest.
 *
 * RATIONALE: The manual route should never act as a general filesystem reader.
 * The whitelist keeps content routing explicit and avoids accidental exposure of
 * arbitrary repository files through route params.
 */
async function readWhitelistedDocMarkdown(relativeDocPath: string): Promise<{ markdown: string; updatedAt: string }> {
  const normalized = path.normalize(relativeDocPath);
  if (!WHITELISTED_DOC_PATHS.has(normalized)) {
    throw new Error(`Manual doc path not whitelisted: ${relativeDocPath}`);
  }

  const absolutePath = path.resolve(process.cwd(), normalized);
  const [content, stats] = await Promise.all([fs.readFile(absolutePath, "utf8"), fs.stat(absolutePath)]);

  return {
    markdown: rewriteDocAssetImagePaths(content),
    updatedAt: stats.mtime.toISOString()
  };
}

/** Builds the lightweight section index used by the manual landing page/TOC. */
export async function getAdminManualIndex(): Promise<AdminManualIndex> {
  const updatedAtEntries = await Promise.all(
    MANUAL_SECTION_MANIFEST.map(async (section) => {
      const absolutePath = path.resolve(process.cwd(), path.normalize(section.sourcePath));
      const stats = await fs.stat(absolutePath);
      return [section.id, stats.mtime.toISOString()] as const;
    })
  );

  const updatedAtById = new Map(updatedAtEntries);

  return {
    generatedAt: new Date().toISOString(),
    sections: MANUAL_SECTION_MANIFEST.map((section) => ({
      ...section,
      updatedAt: updatedAtById.get(section.id) || new Date().toISOString()
    })),
    screenshots: MANUAL_SCREENSHOTS
  };
}

/** Loads one manual section and pre-renders the markdown into HTML for the page. */
export async function getAdminManualSection(sectionId: string): Promise<AdminManualSection | null> {
  const sectionManifest = MANIFEST_BY_ID.get(sectionId);
  if (!sectionManifest) {
    return null;
  }

  const doc = await readWhitelistedDocMarkdown(sectionManifest.sourcePath);
  const html = await marked.parse(doc.markdown, {
    gfm: true,
    breaks: false,
    async: false
  });

  return {
    ...sectionManifest,
    markdown: doc.markdown,
    html,
    updatedAt: doc.updatedAt
  };
}

/** Returns the screenshot metadata referenced by one section manifest entry. */
export function getManualScreenshotsForSection(sectionId: string): ManualScreenshot[] {
  const manifest = MANIFEST_BY_ID.get(sectionId);
  if (!manifest) {
    return [];
  }

  return manifest.screenshotIds
    .map((id) => SCREENSHOT_BY_ID.get(id))
    .filter((screenshot): screenshot is ManualScreenshot => Boolean(screenshot));
}
