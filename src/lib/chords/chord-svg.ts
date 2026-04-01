/**
 * Pure SVG rendering engine for chord diagrams.
 *
 * No React or DOM dependency — returns an SVG string that works both
 * client-side (dangerouslySetInnerHTML) and server-side (PDF/PNG export
 * via sharp).
 *
 * COORDINATE SYSTEM:
 *   - 6 vertical lines (strings), leftmost = low E (string 0)
 *   - Horizontal lines for frets, top = highest fret shown
 *   - When startFret=1, a thick nut bar is drawn at top
 *   - When startFret>1, a fret position number appears left of the first fret
 *   - Left-handed mode mirrors the string order
 */

import type { ChordDiagramData } from "./chord-types";
import { getChordNotes, formatChordName } from "./music-theory";

export interface ChordSvgOptions {
  width?: number;
  height?: number;
  showTitle?: boolean;
  showNoteNames?: boolean;
  showFingerNumbers?: boolean;
  /** Compact mode for thumbnails (smaller text, no title). */
  compact?: boolean;
}

const DEFAULT_OPTS: Required<ChordSvgOptions> = {
  width: 140,
  height: 200,
  showTitle: true,
  showNoteNames: true,
  showFingerNumbers: true,
  compact: false,
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderChordSvg(data: ChordDiagramData, userOpts?: ChordSvgOptions): string {
  const opts = { ...DEFAULT_OPTS, ...userOpts };
  if (opts.compact) {
    opts.showTitle = false;
    opts.showNoteNames = false;
    opts.width = 80;
    opts.height = 100;
  }

  const { fingering, isLeftHanded } = data;
  const { strings: fretValues, fingers, barres, startFret, fretCount } = fingering;

  // String indices: 0=low E .. 5=high E. Left-handed mode reverses visual order.
  const stringOrder = isLeftHanded ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];

  // Layout constants (proportional to width/height)
  const w = opts.width;
  const h = opts.height;
  const margin = { top: opts.showTitle ? 36 : 16, left: 24, right: 16, bottom: opts.showNoteNames ? 28 : 12 };
  const gridW = w - margin.left - margin.right;
  const gridH = h - margin.top - margin.bottom;
  const stringSpacing = gridW / 5;
  const fretSpacing = gridH / fretCount;
  const dotRadius = Math.min(stringSpacing, fretSpacing) * 0.32;
  const fontSize = opts.compact ? 8 : 11;
  const smallFontSize = opts.compact ? 6 : 9;

  function stringX(visualIdx: number): number {
    return margin.left + visualIdx * stringSpacing;
  }
  function fretY(fretIdx: number): number {
    return margin.top + fretIdx * fretSpacing;
  }

  const parts: string[] = [];

  // SVG header
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="font-family:system-ui,-apple-system,sans-serif">`);

  // Background
  parts.push(`<rect width="${w}" height="${h}" fill="white" rx="4"/>`);

  // Title
  if (opts.showTitle) {
    const title = formatChordName(data.name);
    parts.push(`<text x="${w / 2}" y="${margin.top - 10}" text-anchor="middle" font-size="${fontSize + 3}" font-weight="bold" fill="#1a1a2e">${esc(title)}</text>`);
  }

  // Nut or fret position number
  if (startFret === 1) {
    parts.push(`<line x1="${stringX(0)}" y1="${fretY(0)}" x2="${stringX(5)}" y2="${fretY(0)}" stroke="#1a1a2e" stroke-width="3" stroke-linecap="round"/>`);
  } else {
    parts.push(`<line x1="${stringX(0)}" y1="${fretY(0)}" x2="${stringX(5)}" y2="${fretY(0)}" stroke="#555" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 8}" y="${fretY(0) + fretSpacing / 2 + 4}" text-anchor="middle" font-size="${smallFontSize}" fill="#555">${startFret}</text>`);
  }

  // Fret lines
  for (let f = 1; f <= fretCount; f++) {
    parts.push(`<line x1="${stringX(0)}" y1="${fretY(f)}" x2="${stringX(5)}" y2="${fretY(f)}" stroke="#bbb" stroke-width="1"/>`);
  }

  // String lines
  for (let s = 0; s < 6; s++) {
    parts.push(`<line x1="${stringX(s)}" y1="${fretY(0)}" x2="${stringX(s)}" y2="${fretY(fretCount)}" stroke="#888" stroke-width="1"/>`);
  }

  // Barre indicators
  for (const barre of barres) {
    const fromVisual = isLeftHanded ? 5 - barre.toString : stringOrder.indexOf(barre.fromString);
    const toVisual = isLeftHanded ? 5 - barre.fromString : stringOrder.indexOf(barre.toString);
    const minVisual = Math.min(fromVisual, toVisual);
    const maxVisual = Math.max(fromVisual, toVisual);
    const y = fretY(barre.fret - 1) + fretSpacing / 2;
    const x1 = stringX(minVisual);
    const x2 = stringX(maxVisual);

    parts.push(`<rect x="${x1 - dotRadius}" y="${y - dotRadius}" width="${x2 - x1 + dotRadius * 2}" height="${dotRadius * 2}" rx="${dotRadius}" fill="#1a1a2e"/>`);
  }

  // Finger dots and open/muted indicators
  for (let visualIdx = 0; visualIdx < 6; visualIdx++) {
    const actualString = stringOrder[visualIdx];
    const fret = fretValues[actualString];
    const finger = fingers[actualString];
    const x = stringX(visualIdx);

    if (fret === -1) {
      // Muted string — draw X above nut
      const y = fretY(0) - 7;
      const s = opts.compact ? 3 : 4;
      parts.push(`<line x1="${x - s}" y1="${y - s}" x2="${x + s}" y2="${y + s}" stroke="#666" stroke-width="1.5"/>`);
      parts.push(`<line x1="${x + s}" y1="${y - s}" x2="${x - s}" y2="${y + s}" stroke="#666" stroke-width="1.5"/>`);
    } else if (fret === 0) {
      // Open string — draw O above nut
      const y = fretY(0) - 7;
      parts.push(`<circle cx="${x}" cy="${y}" r="${opts.compact ? 3 : 4}" fill="none" stroke="#666" stroke-width="1.5"/>`);
    } else {
      // Fretted — draw dot at fret position
      const y = fretY(fret - 1) + fretSpacing / 2;

      // Skip if this string position is covered by a barre
      const coveredByBarre = barres.some(
        (b) => b.fret === fret && actualString >= b.fromString && actualString <= b.toString
      );
      if (!coveredByBarre) {
        parts.push(`<circle cx="${x}" cy="${y}" r="${dotRadius}" fill="#1a1a2e"/>`);
      }

      // Finger number inside dot
      if (opts.showFingerNumbers && finger > 0) {
        parts.push(`<text x="${x}" y="${y + (opts.compact ? 2.5 : 3.5)}" text-anchor="middle" font-size="${opts.compact ? 6 : 8}" font-weight="bold" fill="white">${finger}</text>`);
      }
    }
  }

  // Note names below the grid
  if (opts.showNoteNames) {
    const notes = getChordNotes(data);
    for (let visualIdx = 0; visualIdx < 6; visualIdx++) {
      const actualString = stringOrder[visualIdx];
      const note = notes[actualString];
      const x = stringX(visualIdx);
      const y = fretY(fretCount) + 14;
      parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="${smallFontSize}" fill="#555">${esc(note)}</text>`);
    }
  }

  parts.push("</svg>");
  return parts.join("\n");
}
