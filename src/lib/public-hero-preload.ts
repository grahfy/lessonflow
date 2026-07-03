import { normalizePath, publicHeroImageByRoute, publicRouteOrder, sharedVisualImageUrls } from "@/lib/site-data";

const preloadCache = new Map<string, Promise<void>>();

function preloadImage(url: string): Promise<void> {
  const existing = preloadCache.get(url);
  if (existing) {
    return existing;
  }

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";

  const loadPromise = new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });

  img.src = url;

  const decodePromise = typeof img.decode === "function"
    ? img.decode().catch(() => undefined).then(() => undefined)
    : loadPromise;

  const settled = Promise.race([decodePromise, loadPromise]).then(() => undefined);
  preloadCache.set(url, settled);
  return settled;
}

function getHeroUrlForPath(pathname: string): string | null {
  const clean = normalizePath(pathname) as (typeof publicRouteOrder)[number];
  return publicHeroImageByRoute[clean] || null;
}

export function primePublicHeroImages(): void {
  const unique = new Set<string>();
  for (const route of publicRouteOrder) {
    unique.add(publicHeroImageByRoute[route]);
  }
  for (const url of sharedVisualImageUrls) {
    unique.add(url);
  }

  for (const url of unique) {
    preloadImage(url);
  }
}

export async function ensurePublicHeroReady(pathname: string, maxWaitMs = 180): Promise<void> {
  const targetUrl = getHeroUrlForPath(pathname);
  if (!targetUrl) {
    return;
  }

  await Promise.race([
    preloadImage(targetUrl),
    new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), maxWaitMs);
    })
  ]);
}
