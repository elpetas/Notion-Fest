/**
 * In-memory cache for generated images so Instagram can fetch a public HTTPS URL.
 * Suitable for demos; use blob storage in production.
 */

const TTL_MS = 60 * 60 * 1000;

interface CachedImage {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

const store = new Map<string, CachedImage>();

function prune(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

export function cacheGeneratedImage(
  buffer: Buffer,
  contentType = "image/png",
): string {
  prune();
  const id = crypto.randomUUID();
  store.set(id, {
    buffer,
    contentType,
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

export function getCachedImage(
  id: string,
): { buffer: Buffer; contentType: string } | null {
  prune();
  const entry = store.get(id);
  if (!entry || entry.expiresAt <= Date.now()) {
    store.delete(id);
    return null;
  }
  return { buffer: entry.buffer, contentType: entry.contentType };
}

export function publicImageUrl(origin: string, imageId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/content/image/${imageId}`;
}
