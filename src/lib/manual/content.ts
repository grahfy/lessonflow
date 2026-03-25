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

function createManualScreenshot(
  id: string,
  alt: string,
  caption: string
): ManualScreenshot {
  const fileName = `${id}.png`;
  return {
    id,
    fileName,
    publicPath: `/documentation/screenshots/${fileName}`,
    documentationPath: `Documentation/assets/${fileName}`,
    alt,
    caption
  };
}

/**
 * Stable screenshot registry used by both the manual UI and the Playwright
 * docs-capture workflow.
 */
export const MANUAL_SCREENSHOTS: ManualScreenshot[] = [
  createManualScreenshot(
    "admin-manual-page",
    "Admin manual page",
    "The in-app manual turns the repository docs into a navigable operator reference."
  ),
  createManualScreenshot(
    "admin-login-page",
    "Admin login page",
    "Owner and staff use the admin login page to access the console."
  ),
  createManualScreenshot(
    "booking-calendar-week-view",
    "Booking calendar week view",
    "The weekly calendar combines confirmed lessons and pending requests."
  ),
  createManualScreenshot(
    "manual-booking-dialog-customer-step",
    "Manual booking dialog customer step",
    "Manual bookings can attach to an existing customer or create a new record."
  ),
  createManualScreenshot(
    "booking-detail-dialog-notes-and-actions",
    "Booking detail dialog actions",
    "Booking detail shows edit, move, notify, materials, and billing actions."
  ),
  createManualScreenshot(
    "booking-create-invoice-dialog",
    "Create invoice from booking dialog",
    "A confirmed booking can open the billing flow without leaving the lesson context."
  ),
  createManualScreenshot(
    "booking-assigned-teacher-dialog",
    "Booking dialog assigned teacher control",
    "Booking editing exposes the assigned teacher field alongside lesson timing and status controls."
  ),
  createManualScreenshot(
    "booking-email-panel",
    "Booking email panel",
    "Booking communication history and manual email drafting stay inside the lesson detail workflow."
  ),
  createManualScreenshot(
    "teachers-workspace-page",
    "Teachers workspace page",
    "The teachers workspace combines a staff directory with assignment-aware profile editing."
  ),
  createManualScreenshot(
    "teachers-directory-list",
    "Teachers directory list",
    "The teacher directory rail makes it easy to move between owner and teacher accounts."
  ),
  createManualScreenshot(
    "teacher-profile-editor-basics",
    "Teacher profile editor basics tab",
    "The Basics tab keeps identity, sign-in, and active status controls together."
  ),
  createManualScreenshot(
    "customer-directory-list",
    "Customer directory list",
    "The customer directory is the support hub for profile, portal, and billing access."
  ),
  createManualScreenshot(
    "customer-editor-create",
    "Customer create dialog",
    "Customer records can be created or edited directly inside the admin console."
  ),
  createManualScreenshot(
    "customer-profile-assigned-teacher",
    "Customer profile assigned teacher field",
    "Customer profiles expose the primary teacher assignment used for follow-up and future defaults."
  ),
  createManualScreenshot(
    "customer-portal-credential-panel",
    "Customer portal credential panel",
    "Portal credential support stays inside the customer profile so admins can reveal or regenerate access quickly."
  ),
  createManualScreenshot(
    "customer-email-history-panel",
    "Customer email history panel",
    "Customer communication history shows message status, provider source, and manual send controls."
  ),
  createManualScreenshot(
    "customer-email-alert-summary",
    "Unread customer email alerts summary",
    "Unread customer email alerts surface matched inbox messages that should be handled from the customer workflow."
  ),
  createManualScreenshot(
    "customer-materials-list-upload-panel",
    "Customer materials upload panel",
    "The customer materials tab combines booking selection, uploads, and file deletion in one panel."
  ),
  createManualScreenshot(
    "invoice-console-list-and-filters",
    "Invoice console list and filters",
    "The invoices list highlights status, overdue balances, and follow-up candidates."
  ),
  createManualScreenshot(
    "invoice-create-dialog",
    "Invoice create dialog",
    "Standalone and lesson-based invoice creation both begin from the invoice create dialog."
  ),
  createManualScreenshot(
    "invoice-detail-send-and-download-pdf",
    "Invoice detail actions",
    "Invoice detail provides send, remind, payment, and PDF actions according to status."
  ),
  createManualScreenshot(
    "invoice-filters-outstanding-aging",
    "Invoice outstanding aging filters",
    "Outstanding-only and aging filters help owners focus on overdue billing."
  ),
  createManualScreenshot(
    "admin-reports-dashboard",
    "Admin reports dashboard",
    "Reports help owners review activity, overdue balances, and earnings trends."
  ),
  createManualScreenshot(
    "reports-custom-range-controls",
    "Reports custom range controls",
    "Custom date-range controls let owners inspect non-standard reporting windows without leaving the dashboard."
  ),
  createManualScreenshot(
    "admin-settings-page",
    "Admin settings page",
    "The settings area combines branding, content, invoice, product, and system configuration."
  ),
  createManualScreenshot(
    "settings-pages-tab",
    "Settings pages tab",
    "The Pages tab edits structured content blocks for legal and student-facing pages."
  ),
  createManualScreenshot(
    "settings-emails-tab",
    "Settings emails tab",
    "The Emails tab groups signature and template editing for automated communication."
  ),
  createManualScreenshot(
    "settings-invoices-tab",
    "Settings invoices tab",
    "The Invoices tab combines billing defaults with invoice template controls."
  ),
  createManualScreenshot(
    "settings-products-tab",
    "Settings products tab",
    "The Products tab manages reusable billing presets such as lesson packages and textbooks."
  ),
  createManualScreenshot(
    "settings-lesson-pricing-tab",
    "Settings lesson pricing tab",
    "The Lesson Info / Prices tab manages active lesson durations and prices used by admin booking and invoice workflows."
  ),
  createManualScreenshot(
    "settings-system-tab",
    "Settings system tab",
    "The System tab exposes infrastructure, delivery, and security settings that require deliberate handling."
  ),
  createManualScreenshot(
    "system-logs-page",
    "System logs page",
    "The logs page helps staff confirm recent system events and collect evidence before escalation."
  ),
  createManualScreenshot(
    "system-log-report-dialog",
    "System log report dialog",
    "The issue-report dialog captures a subject, reply address, description, screenshot, and recent logs."
  ),
  createManualScreenshot(
    "public-book-page",
    "Public booking request page",
    "New students use the public booking form to request lessons."
  ),
  createManualScreenshot(
    "public-contact-page",
    "Public contact page",
    "General enquiries arrive through the public contact form."
  ),
  createManualScreenshot(
    "student-login-page",
    "Student portal login page",
    "Students sign in with name, postcode, and a generated portal password."
  ),
  createManualScreenshot(
    "student-portal-page",
    "Student portal dashboard page",
    "The student portal dashboard shows appointments, requests, and quick access to learning materials."
  ),
  createManualScreenshot(
    "student-portal-materials-view",
    "Student portal materials library page",
    "The dedicated materials library shows lesson-linked files alongside general resources."
  ),
  createManualScreenshot(
    "pending-changes-modal",
    "Pending repository updates modal",
    "The pending-changes modal shows which commits are available before an owner triggers a web update."
  ),
  createManualScreenshot(
    "deployment-updates-latest-tab",
    "Deployment updates dialog latest tab",
    "The Latest tab confirms the currently deployed commit, release label, and included changes."
  ),
  createManualScreenshot(
    "deployment-updates-history-tab",
    "Deployment updates dialog history tab",
    "The History tab helps correlate current behaviour with earlier deployments."
  ),
  createManualScreenshot(
    "admin-about-page",
    "Admin about page",
    "The About page provides stable build metadata and escalation contact details."
  ),
  createManualScreenshot(
    "update-progress-page",
    "Update progress page",
    "The live update progress page shows streamed output and restart status while a web-triggered deployment runs."
  )
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
    id: "staff-management-teacher-assignment",
    title: "Staff Management and Teacher Assignment",
    summary: "Reference guide to the teachers workspace, admin role boundaries, assignment defaults, and single-user owner fallback.",
    group: "operations",
    audience: "all_admins",
    sourcePath: "Documentation/03a-Staff-Management-and-Teacher-Assignment.md",
    relatedRoutes: ["/admin/teachers", "/admin/bookings", "/admin/customers"],
    screenshotIds: [
      "teachers-workspace-page",
      "teachers-directory-list",
      "teacher-profile-editor-basics",
      "booking-assigned-teacher-dialog"
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
    screenshotIds: [
      "customer-directory-list",
      "customer-editor-create",
      "customer-profile-assigned-teacher",
      "customer-portal-credential-panel",
      "customer-email-history-panel",
      "customer-email-alert-summary"
    ]
  },
  {
    id: "learning-materials-notifications",
    title: "Learning Materials and Notifications",
    summary: "Reference article for staff-initiated reminders, custom email, and student-facing learning materials.",
    group: "support",
    audience: "all_admins",
    sourcePath: "Documentation/06-Learning-Materials-and-Notifications.md",
    relatedRoutes: ["/admin/bookings", "/admin/customers", "/student/portal", "/student/materials"],
    screenshotIds: [
      "booking-email-panel",
      "customer-materials-list-upload-panel",
      "student-portal-materials-view"
    ]
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
    screenshotIds: ["admin-reports-dashboard", "reports-custom-range-controls"]
  },
  {
    id: "settings-configuration",
    title: "Settings and Configuration",
    summary: "Configuration reference covering settings tabs, shared save behaviour, and technical-owner boundaries.",
    group: "configuration",
    audience: "all_admins",
    sourcePath: "Documentation/08-Settings-and-Configuration.md",
    relatedRoutes: ["/admin/settings"],
    screenshotIds: [
      "admin-settings-page",
      "settings-pages-tab",
      "settings-emails-tab",
      "settings-invoices-tab",
      "settings-products-tab",
      "settings-lesson-pricing-tab",
      "settings-system-tab"
    ]
  },
  {
    id: "logs-bug-reporting",
    title: "Logs and Bug Reporting",
    summary: "Diagnostic reference for log review, metadata interpretation, and evidence-based issue reporting.",
    group: "diagnostics",
    audience: "all_admins",
    sourcePath: "Documentation/09-Logs-and-Bug-Reporting.md",
    relatedRoutes: ["/admin/system-logs"],
    screenshotIds: ["system-logs-page", "system-log-report-dialog"]
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
    screenshotIds: [
      "pending-changes-modal",
      "deployment-updates-latest-tab",
      "deployment-updates-history-tab",
      "admin-about-page",
      "update-progress-page"
    ]
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
  const withImages = markdown.replace(
    /\((?:\.\/)?(?:(?:Documentation\/)?assets\/([^)]+))\)/g,
    "(/documentation/screenshots/$1)"
  );

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
