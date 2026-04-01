/**
 * Chord diagram export utilities.
 *
 * Uses `sharp` (already a project dependency) to convert the SVG string
 * produced by chord-svg.ts into a PNG buffer. Works server-side only.
 */

import sharp from "sharp";
import type { ChordDiagramData } from "./chord-types";
import { renderChordSvg } from "./chord-svg";

/**
 * Renders a chord diagram as a PNG buffer.
 */
export async function chordToPng(diagram: ChordDiagramData, width = 400): Promise<Buffer> {
  const svg = renderChordSvg(diagram, {
    width: 280,
    height: 400,
    showTitle: true,
    showNoteNames: true,
    showFingerNumbers: true,
  });

  return sharp(Buffer.from(svg))
    .resize(width)
    .png()
    .toBuffer();
}
