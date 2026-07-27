import { importer } from "@coderline/alphatab";

import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";
import { normalizeEnrichmentTag } from "./library-enrichment-taxonomy";

export const ENRICHMENT_APPLY_CONFIDENCE = 0.9;
const CACHE_HOURS = 24;

export type EnrichmentProposal = {
  category: string;
  value: string;
  confidence: number;
  sourceId?: string;
  sourceUrl?: string;
  evidence: string;
};

/** Keeps tags inside the vocabulary staff already use, rather than inventing opaque provider labels. */
function cacheKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}\u0000${artist.trim().toLowerCase()}`;
}

async function cachedJson(provider: string, key: string, url: string): Promise<unknown> {
  const cached = await prisma.libraryEnrichmentCache.findUnique({ where: { provider_cacheKey: { provider, cacheKey: key } } });
  if (cached && cached.expiresAt > new Date()) return cached.payload;
  const response = await fetch(url, { headers: { "user-agent": "LessonFlow library metadata/1.0 (no score downloads)" }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${provider} returned ${response.status}`);
  const payload: unknown = await response.json();
  await prisma.libraryEnrichmentCache.upsert({
    where: { provider_cacheKey: { provider, cacheKey: key } },
    create: { provider, cacheKey: key, payload: payload as never, expiresAt: new Date(Date.now() + CACHE_HOURS * 3600_000) },
    update: { payload: payload as never, expiresAt: new Date(Date.now() + CACHE_HOURS * 3600_000) }
  });
  return payload;
}

/** MusicBrainz identity result only; no media is requested or retained. */
async function lookupMusicBrainz(title: string, artist: string): Promise<EnrichmentProposal[]> {
  const key = cacheKey(title, artist);
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(`recording:${title} AND artist:${artist}`)}&fmt=json&limit=1`;
  const payload = await cachedJson("musicbrainz", key, url) as { recordings?: Array<{ id: string; title: string; "artist-credit"?: Array<{ name?: string }> }> };
  const found = payload.recordings?.[0];
  if (!found || found.title.localeCompare(title, undefined, { sensitivity: "base" }) !== 0) return [];
  const credit = found["artist-credit"]?.map((entry) => entry.name).filter(Boolean).join(", ");
  if (!credit || credit.localeCompare(artist, undefined, { sensitivity: "base" }) !== 0) return [];
  return [{ category: "Artist", value: credit, confidence: 0.8, sourceId: found.id, sourceUrl: `https://musicbrainz.org/recording/${found.id}`, evidence: "MusicBrainz title and artist identity match." }];
}

/** Wikidata independently verifies identity; it is intentionally not trusted alone for tagging. */
async function lookupWikidata(title: string, artist: string): Promise<EnrichmentProposal[]> {
  const key = cacheKey(title, artist);
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(`${title} ${artist}`)}&language=en&format=json&limit=1&origin=*`;
  const payload = await cachedJson("wikidata", key, url) as { search?: Array<{ id: string; label?: string; description?: string }> };
  const found = payload.search?.[0];
  if (!found || !found.label?.toLowerCase().includes(title.toLowerCase())) return [];
  const description = found.description?.toLowerCase() ?? "";
  if (!description.includes(artist.toLowerCase())) return [];
  return [{ category: "Artist", value: artist, confidence: 0.8, sourceId: found.id, sourceUrl: `https://www.wikidata.org/wiki/${found.id}`, evidence: "Wikidata identity search independently matches title and artist." }];
}

/**
 * IMSLP is metadata-only and eligible only where its API exposes explicit free
 * or public-domain licence wording. This adapter never follows file links.
 */
export function imslpHasFreeLicence(text: string | undefined): boolean {
  return /public domain|creative commons|free art license|freely licensed/i.test(text ?? "");
}

async function lookupImslp(title: string, artist: string): Promise<EnrichmentProposal[]> {
  const key = cacheKey(title, artist);
  const url = `https://imslp.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${title} ${artist}`)}&format=json&srlimit=1`;
  const payload = await cachedJson("imslp", key, url) as { query?: { search?: Array<{ pageid: number; title: string; snippet?: string }> } };
  const found = payload.query?.search?.[0];
  if (!found || !imslpHasFreeLicence(found.snippet)) return [];
  return [{ category: "Artist", value: artist, confidence: 0.75, sourceId: String(found.pageid), sourceUrl: `https://imslp.org/wiki/?curid=${found.pageid}`, evidence: "IMSLP search record explicitly indicates public-domain or free licensing; metadata only." }];
}

function parseGuitarPro(buffer: Buffer): EnrichmentProposal[] {
  try {
    const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer));
    const title = String(score.title ?? "").trim();
    const artist = String(score.artist ?? score.words ?? "").trim();
    const proposals: EnrichmentProposal[] = [];
    if (artist) proposals.push({ category: "Artist", value: artist, confidence: 0.95, evidence: "Embedded Guitar Pro score metadata." });
    if (title) proposals.push({ category: "Title", value: title, confidence: 0.95, evidence: "Embedded Guitar Pro score metadata." });
    return proposals;
  } catch {
    return [];
  }
}

/** Enqueues once per new item; retries are owned by the runner. */
export async function enqueueLibraryEnrichment(libraryItemId: string): Promise<void> {
  await prisma.libraryEnrichmentRun.create({ data: { libraryItemId } });
}

/** Process one due job. Provider failures are recorded and backed off, never surfaced to upload callers. */
export async function processNextLibraryEnrichmentRun(): Promise<{ processed: boolean; itemId?: string }> {
  const run = await prisma.libraryEnrichmentRun.findFirst({ where: { status: "queued", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, include: { libraryItem: true } });
  if (!run) return { processed: false };
  await prisma.libraryEnrichmentRun.update({ where: { id: run.id }, data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } } });
  try {
    const local = run.libraryItem.materialType === "guitar_pro"
      ? parseGuitarPro((await createMaterialStorageDriver().get({ storageKey: run.libraryItem.storageKey })).buffer)
      : [];
    const remote = run.libraryItem.artist && run.libraryItem.title
      ? (await Promise.all([lookupMusicBrainz(run.libraryItem.title, run.libraryItem.artist), lookupWikidata(run.libraryItem.title, run.libraryItem.artist), lookupImslp(run.libraryItem.title, run.libraryItem.artist)])).flat()
      : [];
    const proposals = [...local, ...remote].map((proposal) => ({ ...proposal, normalized: normalizeEnrichmentTag(proposal.category, proposal.value) })).filter((proposal) => proposal.normalized);
    const corroborated = new Set<string>();
    for (const proposal of proposals) {
      const key = `${proposal.normalized!.category}\u0000${proposal.normalized!.value}`;
      if (remote.filter((candidate) => normalizeEnrichmentTag(candidate.category, candidate.value) && `${normalizeEnrichmentTag(candidate.category, candidate.value)!.category}\u0000${normalizeEnrichmentTag(candidate.category, candidate.value)!.value}` === key).length >= 2) corroborated.add(key);
    }
    for (const proposal of proposals) {
      const tag = proposal.normalized!;
      const key = `${tag.category}\u0000${tag.value}`;
      const apply = proposal.confidence >= ENRICHMENT_APPLY_CONFIDENCE || corroborated.has(key);
      await prisma.libraryEnrichmentFinding.create({ data: { enrichmentRunId: run.id, category: tag.category, value: tag.value, confidence: apply ? Math.max(proposal.confidence, 0.9) : proposal.confidence, status: apply ? "applied" : "withheld", sourceId: proposal.sourceId, sourceUrl: proposal.sourceUrl, evidence: proposal.evidence } });
      if (apply) {
        const tagRow = await prisma.tag.upsert({ where: { category_value: tag }, create: tag, update: {} });
        await prisma.libraryItemTag.createMany({ data: [{ libraryItemId: run.libraryItemId, tagId: tagRow.id }], skipDuplicates: true });
      }
    }
    await prisma.libraryEnrichmentRun.update({ where: { id: run.id }, data: { status: "completed", completedAt: new Date(), lastError: null } });
    return { processed: true, itemId: run.libraryItemId };
  } catch (error) {
    const attempts = run.attempts + 1;
    const retry = attempts < 5;
    await prisma.libraryEnrichmentRun.update({ where: { id: run.id }, data: { status: retry ? "queued" : "failed", nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000), lastError: error instanceof Error ? error.message : "Enrichment failed." } });
    return { processed: true, itemId: run.libraryItemId };
  }
}
