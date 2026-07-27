/** Pure enrichment helpers shared by browser upload staging and the server runner. */
export function inferArtistAndTitle(fileName: string): { artist: string | null; title: string } {
  const base = fileName.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "")?.trim() || "Untitled";
  const match = base.match(/^(.+?)\s+-\s+(.+)$/);
  return match ? { artist: match[1].trim() || null, title: match[2].trim() || base } : { artist: null, title: base };
}

/** Keeps provider labels inside the library's approved theory taxonomy. */
export function normalizeEnrichmentTag(category: string, value: string): { category: string; value: string } | null {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 200) return null;
  const axis = category.trim().toLowerCase();
  if (axis === "genre" || axis === "style") return { category: "Style", value: cleaned };
  if (axis === "key") return { category: "Key", value: cleaned.replace(/\s*(major|minor)$/i, (_, mode) => mode[0].toUpperCase() + mode.slice(1).toLowerCase()) };
  if (axis === "difficulty" && /^(beginner|intermediate|advanced)$/i.test(cleaned)) return { category: "Difficulty", value: cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase() };
  if (axis === "artist" || axis === "composer") return { category: "Artist", value: cleaned };
  return null;
}
