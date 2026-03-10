/**
 * Invoice PDF Generation Service
 * 
 * This module uses `pdf-lib` to programmatically build professional invoice 
 * and credit note documents as Buffer objects.
 * 
 * DESIGN PHILOSOPHY:
 * 1. Coordinates: PDF space uses points (1/72 inch). y=0 is at the BOTTOM.
 * 2. Fonts: Standard Helvetica is used to avoid external font dependencies.
 * 3. Currency/Date: Formatted for Australian (en-AU) locale.
 * 
 * RATIONALE: We generate PDFs on-the-fly to ensure they always reflect 
 * the latest persisted record. The result is returned as a Buffer 
 * suitable for API responses or email attachments.
 */

import { PDFDocument, StandardFonts, rgb, RGB } from "pdf-lib";
import { InvoiceTemplateRecord } from "@/lib/invoices/template";
import { InvoiceTemplate } from "@/generated/prisma/client";
import { 
  PUBLIC_BRAND_NAME, 
  CONTACT_PHONE, 
  CONTACT_ADDRESS, 
  INVOICE_LOGO_URL,
  DEFAULT_CURRENCY
} from "@/lib/branding";
import fs from "fs/promises";
import path from "path";

/**
 * Utility to convert CSS-style Hex colors to PDF-compatible RGB units (0.0 to 1.0).
 * 
 * @param hex - Hex color string (e.g. "#142e54")
 * @returns pdf-lib RGB color object
 */
function hexToRgb(hex: string): RGB {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Formats a cent-based integer into a human-readable AUD currency string.
 * 
 * @param cents - Total amount in cents
 * @param currency - 3-letter currency code (default: AUD)
 * @returns Formatted string (e.g. "$120.00")
 */
function formatCurrency(cents: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency
  }).format(cents / 100);
}

/**
 * Formats a Date object into a long-form Australian date string.
 * Uses Melbourne timezone as the standard for school records.
 * 
 * @param date - Date to format
 * @returns Formatted string (e.g. "25 December 2024")
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Australia/Melbourne"
  }).format(date);
}

/**
 * Main rendering engine for Invoice and Credit Note PDFs.
 * 
 * ARCHITECTURE:
 * 1. Creates a blank A4 page.
 * 2. Embeds standard fonts.
 * 3. Draws the Header (Logo, Company Info).
 * 4. Draws the Bill-To/Metadata Box.
 * 5. Iterates through line items to build the Table.
 * 6. Adds Totals, Payment Details, and Footers.
 * 
 * @param invoice - The complete invoice record including denormalized line items
 * @param templateConfig - UI configuration for branding (colors, footers, etc.)
 * @returns promise resolving to a PDF Buffer
 */
export async function renderInvoicePdf(invoice: InvoiceTemplateRecord, templateConfig?: InvoiceTemplate | null): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]); // A4 Size in points
  const { width, height } = page.getSize();

  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);

  const accentColor = hexToRgb(templateConfig?.accentColor || "#142e54");
  const logoUrl = templateConfig?.logoUrl || INVOICE_LOGO_URL;
  const footerText = templateConfig?.footerText || "";
  const headerInfo = templateConfig?.headerInfo || "";
  const currency = invoice.currency || DEFAULT_CURRENCY;

  // Background - Fill entire page with white
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(1, 1, 1),
  });

  // Position Cursor Initialization
  let y = height - 60;
  const leftMargin = 40;
  const rightMargin = width - 40;

  // --- TOP SECTION: LOGO & BRANDING ---
  try {
    if (logoUrl) {
      // RATIONALE: pdf-lib ONLY supports PNG/JPEG. If the platform uses WebP
      // (modern web standard), we attempt to fall back to a .png sibling.
      let resolvedLogoUrl = logoUrl;
      if (resolvedLogoUrl.toLowerCase().endsWith(".webp")) {
        console.warn(
          `Invoice logo URL "${resolvedLogoUrl}" is WebP, which pdf-lib cannot embed. ` +
          `Falling back to .png variant.`
        );
        resolvedLogoUrl = resolvedLogoUrl.replace(/\.webp$/i, ".png");
      }

      // LOGIC: Support both absolute URLs and local public paths.
      const logoPath = resolvedLogoUrl.startsWith("/")
        ? path.join(process.cwd(), "public", resolvedLogoUrl)
        : resolvedLogoUrl;
      const logoBytes = await fs.readFile(logoPath);

      const logoImage = resolvedLogoUrl.toLowerCase().endsWith(".png")
        ? await document.embedPng(logoBytes)
        : await document.embedJpg(logoBytes);
      
      const scale = 150 / logoImage.height;
      const logoDims = logoImage.scale(scale);
      page.drawImage(logoImage, {
        x: leftMargin,
        y: height - 60 - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
      });
    }
  } catch (e) {
    console.warn("Could not load invoice logo image from", logoUrl, e);
  }

  /** Helper to right-align text (useful for header/totals) */
  const drawRightText = (text: string, size: number, isBold: boolean, currentY: number, color = rgb(0, 0, 0)) => {
    const f = isBold ? boldFont : font;
    const textWidth = f.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: rightMargin - textWidth,
      y: currentY,
      size,
      font: f,
      color,
    });
  };

  const isCreditNote = invoice.documentType === "credit_note";
  const title = isCreditNote ? "CREDIT NOTE" : "INVOICE";
  drawRightText(title, 42, false, height - 100, rgb(0.1, 0.1, 0.1));

  y = height - 140;
  const sellerName = invoice.sellerBusinessName || PUBLIC_BRAND_NAME;
  drawRightText(sellerName, 11, true, y);
  y -= 14;
  if (invoice.sellerAbn && invoice.sellerAbn.trim() !== "") {
    drawRightText(`ABN: ${invoice.sellerAbn}`, 10, false, y);
    y -= 14;
  }

  // --- HEADER INFO (Custom Template Override) ---
  if (headerInfo) {
    const lines = headerInfo.split("\n");
    for (const line of lines) {
      drawRightText(line, 10, false, y);
      y -= 14;
    }
  } else {
    // Standard branding fallback
    drawRightText(CONTACT_ADDRESS, 10, false, y);
    y -= 14;
    drawRightText("Australia", 10, false, y);
    y -= 14;
    y -= 10;
    drawRightText(`Mobile: ${CONTACT_PHONE}`, 10, false, y);
    y -= 14;
    if (invoice.sellerEmail) {
      drawRightText(`${PUBLIC_BRAND_NAME} <${invoice.sellerEmail}>`, 10, false, y);
      y -= 14;
    }
    drawRightText("www.melbourneguitarschool.com.au", 10, false, y);
    y -= 14;
  }

  // --- BILL TO & METADATA SECTION ---
  y = height - 320;
  page.drawRectangle({
    x: 40,
    y: y - 10,
    width: width - 80,
    height: 80,
    color: rgb(0.95, 0.95, 0.95),
  });

  const labelY = y + 55;
  page.drawText("BILL TO", { x: leftMargin + 10, y: labelY, size: 9, font, color: rgb(0.6, 0.6, 0.6) });
  page.drawText(invoice.customerName, { x: leftMargin + 10, y: labelY - 15, size: 11, font: boldFont });
  page.drawText(invoice.customerEmail, { x: leftMargin + 10, y: labelY - 35, size: 10, font });
  if (invoice.customerPhone) {
    page.drawText(invoice.customerPhone, { x: leftMargin + 10, y: labelY - 50, size: 10, font });
  }
  if (invoice.customerAddress) {
    page.drawText(invoice.customerAddress, { x: leftMargin + 10, y: labelY - 65, size: 10, font });
  }

  const metaX = rightMargin - 220;
  /** Helper to draw label-value pairs in the metadata box */
  const drawMeta = (label: string, value: string, currentY: number, isValueBold: boolean = false) => {
    const f = isValueBold ? boldFont : font;
    const labelWidth = boldFont.widthOfTextAtSize(label, 10);
    page.drawText(label, { x: metaX + 80 - labelWidth, y: currentY, size: 10, font: boldFont });
    page.drawText(value, { x: metaX + 90, y: currentY, size: 10, font: f });
  };

  drawMeta(isCreditNote ? "Credit Note #:" : "Invoice Number:", invoice.invoiceNumber, labelY);
  drawMeta(isCreditNote ? "Credit Note Date:" : "Invoice Date:", formatDate(invoice.issuedAt), labelY - 15);
  drawMeta(isCreditNote ? "Expiry Date:" : "Payment Due:", formatDate(invoice.dueAt), labelY - 30);
  drawMeta(isCreditNote ? "Credit Amount (AUD):" : "Amount Due (AUD):", formatCurrency(invoice.totalCents, currency), labelY - 45, true);

  // --- TABLE SECTION ---
  y -= 40;
  const tableHeaderHeight = 25;
  page.drawRectangle({
    x: 40,
    y: y - tableHeaderHeight,
    width: width - 80,
    height: tableHeaderHeight,
    color: accentColor,
  });

  const headerY = y - 17;
  page.drawText("Items", { x: 50, y: headerY, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText("Quantity", { x: 300, y: headerY, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText("Price", { x: 420, y: headerY, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText("Amount", { x: 500, y: headerY, size: 10, font: boldFont, color: rgb(1, 1, 1) });

  y -= tableHeaderHeight + 15;

  // Render Line Items
  for (const lineItem of invoice.lineItems.sort((a, b) => a.sortOrder - b.sortOrder)) {
    page.drawText(lineItem.description, { x: 50, y, size: 10, font });
    page.drawText(lineItem.quantity.toString(), { x: 315, y, size: 10, font });
    page.drawText(formatCurrency(lineItem.unitPriceCents, currency), { x: 420, y, size: 10, font });
    page.drawText(formatCurrency(lineItem.lineTotalCents, currency), { x: 500, y, size: 10, font });
    y -= 25;
    
    // NOTE: In a production system, we would check if y < margin and add a new page.
    // Given LessonFlow typical invoices are short (1-5 lines), single-page overflow is rare.
  }

  // --- TOTALS SECTION ---
  y -= 10;
  const drawTotal = (label: string, value: string, currentY: number, isValueBold: boolean = false) => {
    const f = isValueBold ? boldFont : font;
    const valWidth = f.widthOfTextAtSize(value, 10);
    page.drawText(label, { x: 360, y: currentY, size: 10, font: boldFont });
    page.drawText(value, { x: rightMargin - 10 - valWidth, y: currentY, size: 10, font: f });
  };

  drawTotal("GST:", formatCurrency(invoice.gstCents, currency), y);
  y -= 15;
  drawTotal("Total:", formatCurrency(invoice.totalCents, currency), y);
  y -= 30;
  drawTotal(isCreditNote ? "Credit Amount (AUD):" : "Amount Due (AUD):", formatCurrency(invoice.totalCents, currency), y, true);

  // --- PAYMENT DETAILS ---
  y -= 60;
  page.drawText("Payment Details", { x: 40, y, size: 11, font: boldFont });
  y -= 18;
  page.drawText(`Bank: ${invoice.bankName}`, { x: 40, y, size: 10, font });
  y -= 14;
  page.drawText(`BSB: ${invoice.bankBsb}`, { x: 40, y, size: 10, font });
  y -= 14;
  page.drawText(`Account Name: ${invoice.bankAccountName}`, { x: 40, y, size: 10, font });
  y -= 14;
  page.drawText(`Account Number: ${invoice.bankAccountNumber}`, { x: 40, y, size: 10, font });

  if (invoice.notes) {
    y -= 30;
    page.drawText("Notes", { x: 40, y, size: 11, font: boldFont });
    y -= 18;
    const lines = invoice.notes.split("\n");
    for (const line of lines) {
      page.drawText(line, { x: 40, y, size: 10, font });
      y -= 14;
    }
  }

  if (footerText) {
    page.drawText(footerText, { x: 40, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }

  // Finalize document and return as Node Buffer
  const bytes = await document.save();
  return Buffer.from(bytes);
}
