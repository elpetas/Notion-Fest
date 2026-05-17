/**
 * Pushes deferred onboarding selections into a newly created Notion workspace.
 */

import {
  clearPendingOnboarding,
  readPendingOnboarding,
  savePendingOnboarding,
} from "@/lib/onboarding-pending-storage";
import { resolveEventbriteUrl } from "@/lib/onboarding/resolve-eventbrite-url";
import {
  buildEventbriteSyncBody,
  postEventbriteSync,
} from "@/lib/onboarding/sync-eventbrite";
import type { EventbriteEventInfo, NotionSetupResponse } from "@/types/festival";

export interface FlushPendingOptions {
  /** Eventbrite URL or ID from chat state when localStorage is missing it */
  eventbriteUrl?: string;
  eventbrite?: EventbriteEventInfo | null;
}

export interface FlushPendingResult {
  eventbrite?: boolean;
  eventbriteTiers?: number;
  eventbriteGuests?: number;
  instagram?: number;
  artists?: number;
  errors: string[];
}

export async function flushPendingOnboarding(
  workspace: NotionSetupResponse,
  options?: FlushPendingOptions,
): Promise<FlushPendingResult> {
  const pending = readPendingOnboarding();
  const result: FlushPendingResult = { errors: [] };

  const ticketDbId = workspace.databaseIds["Ticket tiers"];
  const socialDbId = workspace.databaseIds["Social schedule"];
  const funnelDbId = workspace.databaseIds["Instagram engagement funnel"];
  const rosterDbId = workspace.databaseIds["DJ / Artist roster"];

  const eventbriteUrl = resolveEventbriteUrl({
    explicitUrl: options?.eventbriteUrl,
    pendingUrl: pending?.eventbriteUrl,
    event: options?.eventbrite ?? pending?.eventbrite,
  });

  if (eventbriteUrl && ticketDbId) {
    const body = buildEventbriteSyncBody(workspace, eventbriteUrl);
    if (body) {
      try {
        const { ok, data } = await postEventbriteSync(body);
        if (ok) {
          result.eventbrite = true;
          result.eventbriteTiers = data.synced ?? 0;
          result.eventbriteGuests = data.attendees?.total;
          if (data.warnings?.length) {
            result.errors.push(...data.warnings);
          }
        } else {
          result.errors.push(data.error ?? "Eventbrite sync failed");
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : "Eventbrite sync failed");
      }
    }
  } else if (options?.eventbrite || pending?.eventbrite) {
    result.errors.push(
      "Eventbrite event was imported but no event URL was saved — re-import your Eventbrite link, then deploy again.",
    );
  }

  if (pending?.instagramPosts?.length && socialDbId) {
    try {
      const res = await fetch("/api/instagram/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionDbId: socialDbId,
          postIds: pending.instagramPosts.map((p) => p.id),
          funnelDbId: funnelDbId || undefined,
          syncAllMetrics: false,
        }),
      });
      const data = (await res.json()) as { exported?: number; error?: string };
      if (res.ok) result.instagram = data.exported ?? pending.instagramPosts.length;
      else result.errors.push(data.error ?? "Instagram export failed");
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Instagram export failed");
    }
  }

  if (pending?.artists?.length && rosterDbId) {
    try {
      const statusByArtistId: Record<string, string> = {};
      for (const a of pending.artists) {
        statusByArtistId[a.id] = a.bookingStatus;
      }
      const res = await fetch("/api/spotify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionDbId: rosterDbId,
          artists: pending.artists.map(({ bookingStatus: _s, ...artist }) => artist),
          statusByArtistId,
        }),
      });
      const data = (await res.json()) as { synced?: number; error?: string };
      if (res.ok) result.artists = data.synced ?? pending.artists.length;
      else result.errors.push(data.error ?? "Artist roster sync failed");
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Artist roster sync failed");
    }
  }

  const remaining: {
    eventbriteUrl?: string;
    eventbrite?: EventbriteEventInfo;
    instagramPosts?: NonNullable<typeof pending>["instagramPosts"];
    artists?: NonNullable<typeof pending>["artists"];
  } = {};

  if (!result.eventbrite && eventbriteUrl) {
    remaining.eventbriteUrl = eventbriteUrl;
    remaining.eventbrite = options?.eventbrite ?? pending?.eventbrite;
  }
  if (!result.instagram && pending?.instagramPosts?.length) {
    remaining.instagramPosts = pending.instagramPosts;
  }
  if (!result.artists && pending?.artists?.length) {
    remaining.artists = pending.artists;
  }

  clearPendingOnboarding();
  if (Object.keys(remaining).length > 0) {
    savePendingOnboarding(remaining);
  }

  return result;
}
