import fs from "node:fs/promises";
import path from "node:path";

import { marked } from "marked";

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

export const MANUAL_SECTION_MANIFEST: ManualSectionManifest[] = [
  {
    id: "start-here-features",
    title: "Start Here and Features",
    summary: "The operating model, feature map, and the safest reading order for new users.",
    group: "foundation",
    audience: "all_admins",
    sourcePath: "Documentation/01-Start-Here-and-Features.md",
    relatedRoutes: ["/admin/manual", "/admin/bookings", "/admin/settings"],
    screenshotIds: ["admin-manual-page"]
  },
  {
    id: "first-time-setup-admin-access",
    title: "First-Time Setup and Admin Access",
    summary: "How setup, admin login, sign out, and first-day verification work.",
    group: "foundation",
    audience: "all_admins",
    sourcePath: "Documentation/02-First-Time-Setup-and-Admin-Access.md",
    relatedRoutes: ["/setup", "/admin", "/admin/login"],
    screenshotIds: ["admin-login-page"]
  },
  {
    id: "daily-operations-booking-lifecycle",
    title: "Daily Operations and Booking Lifecycle",
    summary: "The daily rhythm for calendar work, approvals, moves, cancellations, and booking-side actions.",
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
    summary: "Search, profile edits, portal support, billing history, and customer communication tools.",
    group: "support",
    audience: "all_admins",
    sourcePath: "Documentation/04-Customers-Communication-and-Portal-Support.md",
    relatedRoutes: ["/admin/customers", "/admin/bookings", "/admin/invoices"],
    screenshotIds: ["customer-directory-list", "customer-editor-create"]
  },
  {
    id: "learning-materials-notifications",
    title: "Learning Materials and Notifications",
    summary: "Upload materials, help students find them, and use reminder or custom email actions safely.",
    group: "support",
    audience: "all_admins",
    sourcePath: "Documentation/06-Learning-Materials-and-Notifications.md",
    relatedRoutes: ["/admin/bookings", "/admin/customers", "/student/portal"],
    screenshotIds: ["student-portal-page"]
  },
  {
    id: "invoicing-payments",
    title: "Invoicing and Payments",
    summary: "Create, send, follow up, and correct invoices safely through their lifecycle.",
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
    summary: "Use daily, monthly, yearly, and custom reporting to guide follow-up and owner decisions.",
    group: "operations",
    audience: "all_admins",
    sourcePath: "Documentation/07-Reports-and-Follow-Up.md",
    relatedRoutes: ["/admin/reports", "/admin/invoices"],
    screenshotIds: ["admin-reports-dashboard", "invoice-filters-outstanding-aging"]
  },
  {
    id: "settings-configuration",
    title: "Settings and Configuration",
    summary: "A complete guide to every settings tab, editor, grouped field set, and save action.",
    group: "configuration",
    audience: "all_admins",
    sourcePath: "Documentation/08-Settings-and-Configuration.md",
    relatedRoutes: ["/admin/settings"],
    screenshotIds: ["admin-settings-page"]
  },
  {
    id: "logs-bug-reporting",
    title: "Logs and Bug Reporting",
    summary: "Search logs, read metadata, and submit useful technical issue reports with evidence.",
    group: "diagnostics",
    audience: "all_admins",
    sourcePath: "Documentation/09-Logs-and-Bug-Reporting.md",
    relatedRoutes: ["/admin/system-logs"],
    screenshotIds: ["system-logs-page"]
  },
  {
    id: "public-intake-student-portal",
    title: "Public Intake and Student Portal",
    summary: "Understand what website visitors and students experience, and what staff should do next.",
    group: "support",
    audience: "all_admins",
    sourcePath: "Documentation/10-Public-Intake-and-Student-Portal.md",
    relatedRoutes: ["/book", "/contact", "/student/login", "/student/portal"],
    screenshotIds: ["public-book-page", "public-contact-page", "student-login-page", "student-portal-page"]
  },
  {
    id: "updates-release-visibility",
    title: "Updates and Release Visibility",
    summary: "Understand update banners, pending changes, deployment history, and live update progress screens.",
    group: "system",
    audience: "all_admins",
    sourcePath: "Documentation/11-Updates-and-Release-Visibility.md",
    relatedRoutes: ["/admin/about", "/admin/updates/progress", "/admin/bookings"],
    screenshotIds: []
  },
  {
    id: "how-lessonflow-works",
    title: "How LessonFlow Works",
    summary: "A safe high-level overview of the technologies and product layers that work together.",
    group: "system",
    audience: "all_admins",
    sourcePath: "Documentation/12-How-LessonFlow-Works.md",
    relatedRoutes: ["/admin/manual"],
    screenshotIds: []
  },
  {
    id: "troubleshooting-quick-reference",
    title: "Troubleshooting and Quick Reference",
    summary: "Use the symptom map to find the right operational response quickly.",
    group: "diagnostics",
    audience: "all_admins",
    sourcePath: "Documentation/13-Troubleshooting-and-Quick-Reference.md",
    relatedRoutes: ["/admin/system-logs", "/admin/login", "/admin/bookings"],
    screenshotIds: []
  },
  {
    id: "technical-owner-runbook",
    title: "Technical Owner Runbook",
    summary: "Install LessonFlow on a VPS, update it, verify services, and use the deploy script suite safely.",
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

export function getManualScreenshotsForSection(sectionId: string): ManualScreenshot[] {
  const manifest = MANIFEST_BY_ID.get(sectionId);
  if (!manifest) {
    return [];
  }

  return manifest.screenshotIds
    .map((id) => SCREENSHOT_BY_ID.get(id))
    .filter((screenshot): screenshot is ManualScreenshot => Boolean(screenshot));
}
