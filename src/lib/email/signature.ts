import { prisma } from "@/lib/db";
import { getPublicSiteUrl } from "@/lib/env";
import {
  buildEmailBranding,
  escapeHtml,
  renderDefaultSignatureHtml,
  renderSignatureHtml
} from "@/lib/email/layout";

export const DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID = "default-email-signature";

type EmailSignatureSettingsRecord = Awaited<ReturnType<typeof prisma.emailSignatureSettings.findUnique>>;

export type EmailSignatureState = {
  bodyText: string;
  hasCustomBody: boolean;
  logoUrl: string | null;
  hasCustomLogo: boolean;
  resolvedLogoUrl: string;
  updatedAt: string | null;
};

function getEmailSignatureLogoPath(updatedAt: Date | null | undefined): string {
  const version = updatedAt instanceof Date ? updatedAt.getTime() : Date.now();
  return `/api/email/signature-logo?v=${version}`;
}

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const siteUrl = getPublicSiteUrl().replace(/\/+$/, "");
  return `${siteUrl}${url.startsWith("/") ? url : `/${url}`}`;
}

function renderLinkedTextLine(value: string): string {
  const pattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let cursor = 0;
  let html = "";

  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    html += escapeHtml(value.slice(cursor, index));

    const isEmail = token.includes("@") && !/^https?:\/\//i.test(token);
    const href = isEmail
      ? `mailto:${token}`
      : /^https?:\/\//i.test(token)
        ? token
        : `https://${token}`;

    html += `<a href="${escapeHtml(href)}" style="color:#2247d8;text-decoration:none;">${escapeHtml(token)}</a>`;
    cursor = index + token.length;
  }

  html += escapeHtml(value.slice(cursor));
  return html;
}

function renderSimpleRichTextHtml(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => renderLinkedTextLine(line))
    .join("<br/>");
}

function buildCustomSignatureBodyHtml(bodyText: string): string {
  return `
    <div style="margin:0;font-size:13px;line-height:1.7;color:#41506f;">
      ${renderSimpleRichTextHtml(bodyText)}
    </div>
  `;
}

function toLogoUrl(settings: { logoStorageKey: string | null; updatedAt: Date | null | undefined }): string | null {
  if (!settings.logoStorageKey) {
    return null;
  }

  return getEmailSignatureLogoPath(settings.updatedAt);
}

export function serializeEmailSignatureSettings(record: EmailSignatureSettingsRecord): EmailSignatureState {
  const branding = buildEmailBranding();
  const logoUrl = toLogoUrl({
    logoStorageKey: record?.logoStorageKey || null,
    updatedAt: record?.updatedAt
  });

  return {
    bodyText: record?.bodyText || "",
    hasCustomBody: Boolean(record?.bodyText?.trim()),
    logoUrl,
    hasCustomLogo: Boolean(record?.logoStorageKey),
    resolvedLogoUrl: logoUrl ? toAbsoluteUrl(logoUrl) : branding.logoUrl,
    updatedAt: record?.updatedAt?.toISOString() || null
  };
}

export async function getEmailSignatureSettings() {
  return prisma.emailSignatureSettings.findUnique({
    where: { id: DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID }
  });
}

export async function saveEmailSignatureBodyText(bodyText: string) {
  const normalizedBodyText = bodyText.trim();
  const existing = await getEmailSignatureSettings();

  return prisma.emailSignatureSettings.upsert({
    where: { id: DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID },
    update: {
      bodyText: normalizedBodyText || null,
      logoStorageKey: existing?.logoStorageKey ?? null,
      logoMimeType: existing?.logoMimeType ?? null
    },
    create: {
      id: DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID,
      bodyText: normalizedBodyText || null,
      logoStorageKey: existing?.logoStorageKey ?? null,
      logoMimeType: existing?.logoMimeType ?? null
    }
  });
}

export async function saveEmailSignatureLogo(input: {
  storageKey: string;
  mimeType: string;
}) {
  const existing = await getEmailSignatureSettings();

  return prisma.emailSignatureSettings.upsert({
    where: { id: DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID },
    update: {
      bodyText: existing?.bodyText ?? null,
      logoStorageKey: input.storageKey,
      logoMimeType: input.mimeType
    },
    create: {
      id: DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID,
      bodyText: existing?.bodyText ?? null,
      logoStorageKey: input.storageKey,
      logoMimeType: input.mimeType
    }
  });
}

export async function clearEmailSignatureLogo() {
  const existing = await getEmailSignatureSettings();

  return prisma.emailSignatureSettings.upsert({
    where: { id: DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID },
    update: {
      bodyText: existing?.bodyText ?? null,
      logoStorageKey: null,
      logoMimeType: null
    },
    create: {
      id: DEFAULT_EMAIL_SIGNATURE_SETTINGS_ID,
      bodyText: existing?.bodyText ?? null,
      logoStorageKey: null,
      logoMimeType: null
    }
  });
}

export async function renderResolvedSignatureHtml(): Promise<string> {
  const settings = await getEmailSignatureSettings();
  const branding = buildEmailBranding();
  const customBodyText = settings?.bodyText?.trim() || "";
  const customLogoPath = toLogoUrl({
    logoStorageKey: settings?.logoStorageKey || null,
    updatedAt: settings?.updatedAt
  });
  const resolvedLogoUrl = customLogoPath ? toAbsoluteUrl(customLogoPath) : branding.logoUrl;

  if (!customBodyText) {
    return renderDefaultSignatureHtml({
      ...branding,
      logoUrl: resolvedLogoUrl
    });
  }

  return renderSignatureHtml({
    brandName: branding.brandName,
    logoUrl: resolvedLogoUrl,
    bodyHtml: buildCustomSignatureBodyHtml(customBodyText)
  });
}
