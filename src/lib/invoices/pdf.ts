import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { InvoiceTemplateRecord } from "@/lib/invoices/template";
import fs from "fs/promises";
import path from "path";

/**
 * Formats integer cents into compact AUD display text for PDF rendering.
 */
function aud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(cents / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Australia/Melbourne"
  }).format(date);
}

/**
 * Creates an invoice PDF as a binary buffer for download and email attachment.
 */
export async function renderInvoicePdf(invoice: InvoiceTemplateRecord): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.93, 0.93, 0.93),
  });

  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), "public/images/company-logo-invoice.png"));
    const logoImage = await document.embedPng(logoBytes);
    const scale = 120 / logoImage.height;
    const logoDims = logoImage.scale(scale);
    page.drawImage(logoImage, {
      x: 40,
      y: height - 60 - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
  } catch (e) {
    console.warn("Could not load invoice logo image", e);
  }

  let y = height - 70;
  const rightMargin = width - 40;

  const drawRightText = (text: string, size: number, isBold: boolean, currentY: number) => {
    const f = isBold ? boldFont : font;
    const textWidth = f.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: rightMargin - textWidth,
      y: currentY,
      size,
      font: f,
      color: rgb(0, 0, 0),
    });
  };

  const title = invoice.documentType === "credit_note" ? "CREDIT NOTE" : "INVOICE";
  drawRightText(title, 40, false, y);
  y -= 45;

  const sellerName = invoice.sellerBusinessName || "Melbourne Guitar School";
  drawRightText(sellerName, 12, true, y);
  y -= 16;
  if (invoice.sellerAbn) {
    drawRightText(`ABN: ${invoice.sellerAbn}`, 11, false, y);
    y -= 16;
  }
  drawRightText("Rear 66/68 High Street", 11, false, y);
  y -= 16;
  drawRightText("Northcote, Victoria 3070", 11, false, y);
  y -= 16;
  drawRightText("Australia", 11, false, y);
  y -= 24;
  drawRightText("Mobile: 0401489437", 11, false, y);
  y -= 16;
  if (invoice.sellerEmail) {
    drawRightText(invoice.sellerEmail, 11, false, y);
    y -= 16;
  }
  drawRightText("www.melbourneguitarschool.com.au", 11, false, y);

  y -= 30;

  page.drawLine({
    start: { x: 0, y },
    end: { x: width, y },
    thickness: 1,
    color: rgb(0.83, 0.83, 0.83),
  });

  y -= 30;

  page.drawText("BILL TO", { x: 40, y, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 18;
  page.drawText(invoice.customerName, { x: 40, y, size: 12, font: boldFont, color: rgb(0, 0, 0) });
  y -= 30;
  page.drawText(invoice.customerEmail, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
  
  if (invoice.customerPhone) {
    y -= 16;
    page.drawText(invoice.customerPhone, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
  }
  if (invoice.customerAddress) {
    y -= 16;
    page.drawText(invoice.customerAddress, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
  }

  const detailsY = height - 305;
  const labelColRightEdge = rightMargin - 120;
  
  const drawPair = (label: string, value: string, currentY: number, isValueBold: boolean = false) => {
    const labelWidth = boldFont.widthOfTextAtSize(label, 11);
    page.drawText(label, { x: labelColRightEdge - labelWidth, y: currentY, size: 11, font: boldFont, color: rgb(0, 0, 0) });
    
    const vFont = isValueBold ? boldFont : font;
    page.drawText(value, { x: labelColRightEdge + 10, y: currentY, size: 11, font: vFont, color: rgb(0, 0, 0) });
  };

  drawPair("Invoice Number:", invoice.invoiceNumber, detailsY);
  drawPair("Invoice Date:", formatDate(invoice.issuedAt), detailsY - 20);
  drawPair("Payment Due:", formatDate(invoice.dueAt), detailsY - 40);

  page.drawRectangle({
    x: labelColRightEdge - 100,
    y: detailsY - 60 - 6,
    width: width - (labelColRightEdge - 100),
    height: 22,
    color: rgb(0.87, 0.87, 0.87),
  });
  
  drawPair("Amount Due (AUD):", aud(invoice.totalCents), detailsY - 60, true);

  y = detailsY - 100;

  const tableHeaderHeight = 30;
  page.drawRectangle({
    x: 0,
    y: y - tableHeaderHeight,
    width,
    height: tableHeaderHeight,
    color: rgb(0.08, 0.16, 0.36),
  });

  const headerY = y - 19;
  const colQty = 300;
  const colPrice = 430;
  
  page.drawText("Items", { x: 40, y: headerY, size: 11, font: boldFont, color: rgb(1, 1, 1) });
  
  const qtyTitle = "Quantity";
  const qtyTitleW = boldFont.widthOfTextAtSize(qtyTitle, 11);
  page.drawText(qtyTitle, { x: colQty - (qtyTitleW / 2), y: headerY, size: 11, font: boldFont, color: rgb(1, 1, 1) });
  
  const priceTitle = "Price";
  const priceTitleW = boldFont.widthOfTextAtSize(priceTitle, 11);
  page.drawText(priceTitle, { x: colPrice - priceTitleW, y: headerY, size: 11, font: boldFont, color: rgb(1, 1, 1) });
  
  const amountTitle = "Amount";
  const amountTitleW = boldFont.widthOfTextAtSize(amountTitle, 11);
  page.drawText(amountTitle, { x: rightMargin - amountTitleW, y: headerY, size: 11, font: boldFont, color: rgb(1, 1, 1) });

  y -= tableHeaderHeight + 20;

  for (const lineItem of invoice.lineItems.sort((a, b) => a.sortOrder - b.sortOrder)) {
    page.drawText(lineItem.description, { x: 40, y, size: 11, font: boldFont, color: rgb(0, 0, 0) });
    
    const qtyText = lineItem.quantity.toString();
    const qtyTextW = font.widthOfTextAtSize(qtyText, 11);
    page.drawText(qtyText, { x: colQty - (qtyTextW / 2), y, size: 11, font, color: rgb(0, 0, 0) });
    
    const priceText = aud(lineItem.unitPriceCents);
    const priceTextW = font.widthOfTextAtSize(priceText, 11);
    page.drawText(priceText, { x: colPrice - priceTextW, y, size: 11, font, color: rgb(0, 0, 0) });
    
    const amtText = aud(lineItem.lineTotalCents);
    const amtTextW = font.widthOfTextAtSize(amtText, 11);
    page.drawText(amtText, { x: rightMargin - amtTextW, y, size: 11, font, color: rgb(0, 0, 0) });

    y -= 30;
  }

  y += 10;

  page.drawLine({
    start: { x: 0, y },
    end: { x: width, y },
    thickness: 1,
    color: rgb(0.83, 0.83, 0.83),
  });

  y -= 30;

  const totalsLabelColRightEdge = rightMargin - 80;
  
  const drawTotalPair = (label: string, value: string, currentY: number, isValueBold: boolean = false) => {
    const labelWidth = boldFont.widthOfTextAtSize(label, 11);
    page.drawText(label, { x: totalsLabelColRightEdge - labelWidth, y: currentY, size: 11, font: boldFont, color: rgb(0, 0, 0) });
    
    const vFont = isValueBold ? boldFont : font;
    const valWidth = vFont.widthOfTextAtSize(value, 11);
    page.drawText(value, { x: rightMargin - valWidth, y: currentY, size: 11, font: vFont, color: rgb(0, 0, 0) });
  };

  drawTotalPair("Total:", aud(invoice.totalCents), y);
  y -= 14;
  
  page.drawLine({
    start: { x: totalsLabelColRightEdge - 60, y },
    end: { x: rightMargin, y },
    thickness: 1,
    color: rgb(0.83, 0.83, 0.83),
  });

  y -= 20;
  drawTotalPair("Amount Due (AUD):", aud(invoice.totalCents), y, true);
  
  y -= 60;
  page.drawText("Payment Details", { x: 40, y, size: 11, font: boldFont, color: rgb(0, 0, 0) });
  y -= 18;
  page.drawText(`Bank: ${invoice.bankName}`, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
  y -= 14;
  page.drawText(`BSB: ${invoice.bankBsb}`, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
  y -= 14;
  page.drawText(`Account Name: ${invoice.bankAccountName}`, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
  y -= 14;
  page.drawText(`Account Number: ${invoice.bankAccountNumber}`, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });

  if (invoice.notes) {
    y -= 30;
    page.drawText("Notes", { x: 40, y, size: 11, font: boldFont, color: rgb(0, 0, 0) });
    y -= 18;
    page.drawText(invoice.notes, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
  }

  const bytes = await document.save();
  return Buffer.from(bytes);
}
