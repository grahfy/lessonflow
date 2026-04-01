/**
 * Chord chart PDF generation.
 *
 * Uses pdf-lib to render a grid of chord diagrams on A4 pages,
 * following the pattern from src/lib/invoices/pdf.ts.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import type { ChordDiagramData } from "./chord-types";
import { renderChordSvg } from "./chord-svg";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;
const COLS = 4;
const CHORD_WIDTH = (A4_WIDTH - MARGIN * 2 - (COLS - 1) * 12) / COLS;
const CHORD_HEIGHT = CHORD_WIDTH * 1.4;
const ANNOTATION_HEIGHT = 14;

interface ChordChartItem {
  diagram: ChordDiagramData;
  annotation?: string | null;
}

/**
 * Generates a PDF chord chart as a Buffer.
 */
export async function generateChordChartPdf(
  title: string,
  description: string | undefined | null,
  items: ChordChartItem[]
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Pre-render all chord SVGs to PNG
  const pngBuffers = await Promise.all(
    items.map(async (item) => {
      const svg = renderChordSvg(item.diagram, {
        width: 200,
        height: 280,
        showTitle: true,
        showNoteNames: true,
        showFingerNumbers: true,
      });
      return sharp(Buffer.from(svg))
        .resize(Math.round(CHORD_WIDTH * 2))
        .png()
        .toBuffer();
    })
  );

  let page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  let cursorY = A4_HEIGHT - MARGIN;

  // Title
  const titleSize = 18;
  cursorY -= titleSize;
  page.drawText(title, {
    x: MARGIN,
    y: cursorY,
    size: titleSize,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.12),
  });
  cursorY -= 8;

  // Description
  if (description) {
    const descSize = 11;
    cursorY -= descSize;
    page.drawText(description, {
      x: MARGIN,
      y: cursorY,
      size: descSize,
      font,
      color: rgb(0.35, 0.35, 0.4),
      maxWidth: A4_WIDTH - MARGIN * 2,
    });
    cursorY -= 8;
  }

  cursorY -= 16;

  // Render chord grid
  for (let i = 0; i < items.length; i++) {
    const col = i % COLS;
    const isNewRow = col === 0 && i > 0;

    if (isNewRow) {
      cursorY -= CHORD_HEIGHT + ANNOTATION_HEIGHT + 16;
    }

    // Check if we need a new page
    if (cursorY - CHORD_HEIGHT - ANNOTATION_HEIGHT < MARGIN) {
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      cursorY = A4_HEIGHT - MARGIN;
    }

    const x = MARGIN + col * (CHORD_WIDTH + 12);
    const y = cursorY - CHORD_HEIGHT;

    // Embed PNG
    const pngImage = await doc.embedPng(pngBuffers[i]);
    page.drawImage(pngImage, {
      x,
      y,
      width: CHORD_WIDTH,
      height: CHORD_HEIGHT,
    });

    // Annotation below chord
    const annotation = items[i].annotation;
    if (annotation) {
      page.drawText(annotation, {
        x: x + CHORD_WIDTH / 2 - font.widthOfTextAtSize(annotation, 9) / 2,
        y: y - 12,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.45),
      });
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
