"use client";

interface ChordBuilderFingerSelectorProps {
  selected: number;
  onChange: (finger: number) => void;
}

const FINGER_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 0, label: "\u2715" }, // × = eraser
];

/**
 * Radio-style finger selector for the chord builder.
 * Select a finger (1–4) then click the fretboard to place it.
 * The eraser (×) removes dots on click.
 */
export function ChordBuilderFingerSelector({
  selected,
  onChange,
}: ChordBuilderFingerSelectorProps) {
  return (
    <div className="chord-builder-finger-selector">
      <label className="chord-builder-label">Finger</label>
      <div className="chord-builder-finger-buttons">
        {FINGER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`chord-builder-finger-btn${selected === value ? " is-active" : ""}`}
            onClick={() => onChange(value)}
            title={value === 0 ? "Eraser" : `Finger ${value}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
