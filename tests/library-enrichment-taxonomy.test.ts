import { describe, expect, it } from "vitest";

import { inferArtistAndTitle, normalizeEnrichmentTag } from "@/lib/library/library-enrichment-taxonomy";

describe("library enrichment taxonomy", () => {
  it("uses a filename hint without requiring an external lookup", () => {
    expect(inferArtistAndTitle("J. S. Bach - Bourree.gp5")).toEqual({ artist: "J. S. Bach", title: "Bourree" });
    expect(inferArtistAndTitle("warmup.pdf")).toEqual({ artist: null, title: "warmup" });
  });

  it("accepts only the approved normalized axes and difficulty scale", () => {
    expect(normalizeEnrichmentTag("genre", "  Classical  ")).toEqual({ category: "Style", value: "Classical" });
    expect(normalizeEnrichmentTag("difficulty", "advanced")).toEqual({ category: "Difficulty", value: "Advanced" });
    expect(normalizeEnrichmentTag("difficulty", "expert")).toBeNull();
    expect(normalizeEnrichmentTag("untrusted provider field", "value")).toBeNull();
  });
});
