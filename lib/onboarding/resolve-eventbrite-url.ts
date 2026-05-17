import type { EventbriteEventInfo } from "@/types/festival";

/** Best Eventbrite URL or numeric ID for sync API calls. */
export function resolveEventbriteUrl(
  sources: {
    explicitUrl?: string | null;
    pendingUrl?: string | null;
    event?: EventbriteEventInfo | null;
  },
): string | undefined {
  const explicit = sources.explicitUrl?.trim();
  if (explicit) return explicit;

  const pending = sources.pendingUrl?.trim();
  if (pending) return pending;

  const fromEvent = sources.event?.url?.trim() || sources.event?.id?.trim();
  if (fromEvent) return fromEvent;

  return undefined;
}
