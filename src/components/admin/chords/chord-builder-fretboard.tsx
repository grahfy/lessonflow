"use client";

import { useCallback, useRef, useState } from "react";
import type { ChordDiagramData, BarreIndicator } from "@/lib/chords/chord-types";
import { getChordNotes, formatChordName } from "@/lib/chords/music-theory";

interface ChordBuilderFretboardProps {
  diagram: ChordDiagramData;
  selectedFinger: number;
  onPlaceDot: (stringIndex: number, fret: number, finger: number) => void;
  onRemoveDot: (stringIndex: number) => void;
  onCycleStringState: (stringIndex: number) => void;
  onAddBarre: (barre: BarreIndicator) => void;
}

/**
 * Interactive SVG fretboard for the chord builder.
 * Click fret intersections to place/remove dots, click above the nut to
 * cycle open/muted, drag across strings on the same fret to create barres.
 */
export function ChordBuilderFretboard({
  diagram,
  selectedFinger,
  onPlaceDot,
  onRemoveDot,
  onCycleStringState,
  onAddBarre,
}: ChordBuilderFretboardProps) {
  const { fingering, isLeftHanded } = diagram;
  const { strings: fretValues, fingers, barres, startFret, fretCount } = fingering;
  const stringOrder = isLeftHanded ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<{ fret: number; fromString: number } | null>(null);

  // Layout
  const w = 260;
  const h = 320;
  const margin = { top: 50, left: 36, right: 24, bottom: 36 };
  const gridW = w - margin.left - margin.right;
  const gridH = h - margin.top - margin.bottom;
  const stringSpacing = gridW / 5;
  const fretSpacing = gridH / fretCount;
  const dotRadius = Math.min(stringSpacing, fretSpacing) * 0.32;

  function stringX(visualIdx: number): number {
    return margin.left + visualIdx * stringSpacing;
  }
  function fretY(fretIdx: number): number {
    return margin.top + fretIdx * fretSpacing;
  }

  // Map click position to string/fret
  function posToStringFret(clientX: number, clientY: number): { stringIdx: number; fretIdx: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = w / rect.width;
    const scaleY = h / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // Find nearest string
    let nearestString = 0;
    let minDist = Infinity;
    for (let i = 0; i < 6; i++) {
      const d = Math.abs(x - stringX(i));
      if (d < minDist) {
        minDist = d;
        nearestString = i;
      }
    }
    if (minDist > stringSpacing * 0.6) return null;

    // Check if above nut (open/muted toggle area)
    if (y < fretY(0) - 1) {
      return { stringIdx: nearestString, fretIdx: -1 };
    }

    // Find nearest fret position
    for (let f = 1; f <= fretCount; f++) {
      const fretCenter = fretY(f - 1) + fretSpacing / 2;
      if (Math.abs(y - fretCenter) < fretSpacing * 0.5) {
        return { stringIdx: nearestString, fretIdx: f };
      }
    }
    return null;
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pos = posToStringFret(e.clientX, e.clientY);
      if (!pos) return;

      const actualString = stringOrder[pos.stringIdx];

      if (pos.fretIdx === -1) {
        onCycleStringState(actualString);
        return;
      }

      // Start potential barre drag
      setDragState({ fret: pos.fretIdx, fromString: pos.stringIdx });

      // Check if there's already a dot at this position
      if (fretValues[actualString] === pos.fretIdx) {
        onRemoveDot(actualString);
      } else {
        onPlaceDot(actualString, pos.fretIdx, selectedFinger);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stringOrder, fretValues, selectedFinger, onPlaceDot, onRemoveDot, onCycleStringState]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState) return;
      const pos = posToStringFret(e.clientX, e.clientY);
      if (pos && pos.fretIdx === dragState.fret && pos.stringIdx !== dragState.fromString) {
        const from = stringOrder[dragState.fromString];
        const to = stringOrder[pos.stringIdx];
        onAddBarre({
          fret: dragState.fret,
          fromString: Math.min(from, to),
          toString: Math.max(from, to),
        });
        // Place dots on all barre strings
        const minS = Math.min(dragState.fromString, pos.stringIdx);
        const maxS = Math.max(dragState.fromString, pos.stringIdx);
        for (let s = minS; s <= maxS; s++) {
          const actual = stringOrder[s];
          if (fretValues[actual] <= 0) {
            onPlaceDot(actual, dragState.fret, selectedFinger);
          }
        }
      }
      setDragState(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragState, stringOrder, fretValues, selectedFinger, onPlaceDot, onAddBarre]
  );

  const notes = getChordNotes(diagram);
  const title = formatChordName(diagram.name);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className="chord-builder-fretboard"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      style={{ cursor: "pointer", userSelect: "none", maxWidth: 260 }}
    >
      {/* Title */}
      <text x={w / 2} y={24} textAnchor="middle" fontSize={18} fontWeight="bold" fill="#1a1a2e">
        {title}
      </text>

      {/* Nut or fret position indicator */}
      {startFret === 1 ? (
        <line
          x1={stringX(0)} y1={fretY(0)} x2={stringX(5)} y2={fretY(0)}
          stroke="#1a1a2e" strokeWidth={4} strokeLinecap="round"
        />
      ) : (
        <>
          <line
            x1={stringX(0)} y1={fretY(0)} x2={stringX(5)} y2={fretY(0)}
            stroke="#555" strokeWidth={1}
          />
          <text
            x={margin.left - 14} y={fretY(0) + fretSpacing / 2 + 5}
            textAnchor="middle" fontSize={12} fill="#555"
          >
            {startFret}
          </text>
        </>
      )}

      {/* Fret lines */}
      {Array.from({ length: fretCount }, (_, f) => (
        <line
          key={`fret-${f}`}
          x1={stringX(0)} y1={fretY(f + 1)} x2={stringX(5)} y2={fretY(f + 1)}
          stroke="#ccc" strokeWidth={1}
        />
      ))}

      {/* String lines */}
      {Array.from({ length: 6 }, (_, s) => (
        <line
          key={`string-${s}`}
          x1={stringX(s)} y1={fretY(0)} x2={stringX(s)} y2={fretY(fretCount)}
          stroke="#999" strokeWidth={1}
        />
      ))}

      {/* Invisible click targets for each fret/string intersection */}
      {Array.from({ length: 6 }, (_, visualIdx) =>
        Array.from({ length: fretCount }, (_, fretIdx) => (
          <rect
            key={`target-${visualIdx}-${fretIdx}`}
            x={stringX(visualIdx) - stringSpacing / 2}
            y={fretY(fretIdx)}
            width={stringSpacing}
            height={fretSpacing}
            fill="transparent"
          />
        ))
      )}

      {/* Open/muted click targets above nut */}
      {Array.from({ length: 6 }, (_, visualIdx) => (
        <rect
          key={`nut-target-${visualIdx}`}
          x={stringX(visualIdx) - stringSpacing / 2}
          y={fretY(0) - 20}
          width={stringSpacing}
          height={20}
          fill="transparent"
        />
      ))}

      {/* Barre indicators */}
      {barres.map((barre, i) => {
        const fromVisual = isLeftHanded ? 5 - barre.toString : stringOrder.indexOf(barre.fromString);
        const toVisual = isLeftHanded ? 5 - barre.fromString : stringOrder.indexOf(barre.toString);
        const minV = Math.min(fromVisual, toVisual);
        const maxV = Math.max(fromVisual, toVisual);
        const y = fretY(barre.fret - 1) + fretSpacing / 2;
        return (
          <rect
            key={`barre-${i}`}
            x={stringX(minV) - dotRadius}
            y={y - dotRadius}
            width={stringX(maxV) - stringX(minV) + dotRadius * 2}
            height={dotRadius * 2}
            rx={dotRadius}
            fill="#1a1a2e"
          />
        );
      })}

      {/* Finger dots and open/muted indicators */}
      {Array.from({ length: 6 }, (_, visualIdx) => {
        const actualString = stringOrder[visualIdx];
        const fret = fretValues[actualString];
        const finger = fingers[actualString];
        const x = stringX(visualIdx);

        if (fret === -1) {
          const y = fretY(0) - 8;
          return (
            <g key={`indicator-${visualIdx}`}>
              <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke="#666" strokeWidth={2} />
              <line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} stroke="#666" strokeWidth={2} />
            </g>
          );
        }
        if (fret === 0) {
          const y = fretY(0) - 8;
          return <circle key={`indicator-${visualIdx}`} cx={x} cy={y} r={5} fill="none" stroke="#666" strokeWidth={2} />;
        }

        const y = fretY(fret - 1) + fretSpacing / 2;
        const coveredByBarre = barres.some(
          (b) => b.fret === fret && actualString >= b.fromString && actualString <= b.toString
        );
        return (
          <g key={`indicator-${visualIdx}`}>
            {!coveredByBarre && <circle cx={x} cy={y} r={dotRadius} fill="#1a1a2e" />}
            {finger > 0 && (
              <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="white">
                {finger}
              </text>
            )}
          </g>
        );
      })}

      {/* Note names below */}
      {Array.from({ length: 6 }, (_, visualIdx) => {
        const actualString = stringOrder[visualIdx];
        const note = notes[actualString];
        return (
          <text
            key={`note-${visualIdx}`}
            x={stringX(visualIdx)}
            y={fretY(fretCount) + 18}
            textAnchor="middle"
            fontSize={10}
            fill="#555"
          >
            {note}
          </text>
        );
      })}
    </svg>
  );
}
