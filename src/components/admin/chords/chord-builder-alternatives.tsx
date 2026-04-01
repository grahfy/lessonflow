"use client";

import { useEffect, useState } from "react";
import type { ChordFingering } from "@/lib/chords/chord-types";
import { lookupChordVoicings } from "@/lib/chords/chord-lookup";
import { renderChordSvg } from "@/lib/chords/chord-svg";
import type { ChordDiagramData } from "@/lib/chords/chord-types";
import { STANDARD_TUNING } from "@/lib/chords/chord-types";

interface ChordBuilderAlternativesProps {
  root: string;
  quality: string;
  bassNote?: string;
  isLeftHanded: boolean;
  onSelect: (fingering: ChordFingering) => void;
}

/**
 * Right panel of the chord builder — displays alternative voicing thumbnails
 * from the chords-db database. Clicking a thumbnail loads it into the main
 * fretboard. Similar to Guitar Pro's "Alternatives" section.
 */
export function ChordBuilderAlternatives({
  root,
  quality,
  bassNote,
  isLeftHanded,
  onSelect,
}: ChordBuilderAlternativesProps) {
  const [voicings, setVoicings] = useState<ChordFingering[]>([]);

  useEffect(() => {
    const results = lookupChordVoicings(root, quality, bassNote);
    setVoicings(results);
  }, [root, quality, bassNote]);

  if (voicings.length === 0) {
    return (
      <div className="chord-builder-alternatives">
        <label className="chord-builder-label">Alternatives</label>
        <p className="chord-builder-no-alternatives">No voicings found</p>
      </div>
    );
  }

  return (
    <div className="chord-builder-alternatives">
      <label className="chord-builder-label">Alternatives</label>
      <div className="chord-builder-alternatives-grid">
        {voicings.map((v, i) => {
          const previewDiagram: ChordDiagramData = {
            name: { root, quality },
            fingering: v,
            tuning: [...STANDARD_TUNING],
            isLeftHanded,
          };
          const svg = renderChordSvg(previewDiagram, { compact: true });
          return (
            <button
              key={i}
              type="button"
              className="chord-builder-alternative-btn"
              onClick={() => onSelect(v)}
              title={`Voicing ${i + 1}`}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          );
        })}
      </div>
    </div>
  );
}
