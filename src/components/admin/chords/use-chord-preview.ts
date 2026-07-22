"use client";

/**
 * Re-exports the shared chord-preview sampler and hook. Moved out to
 * src/lib/chords/chord-preview-sampler.ts (non-React bootstrap) and
 * src/components/chords/use-chord-preview.ts (the hook) so the student chord
 * browser can reuse the same Tone.Sampler instead of loading the sample
 * pack twice. Kept as a re-export, not deleted, so existing imports from
 * this path (admin chord builder, tests) keep working unchanged.
 */
export * from "@/lib/chords/chord-preview-sampler";
export * from "@/components/chords/use-chord-preview";
