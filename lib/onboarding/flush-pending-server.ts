/**
 * Server-side flush of pending onboarding into Notion (used after hub scaffold).
 */

import {
  buildEventbriteSyncBody,
  type EventbriteSyncApiResult,
} from "@/lib/onboarding/sync-eventbrite";
import { resolveEventbriteUrl } from "@/lib/onboarding/resolve-eventbrite-url";
import type { EventbriteEventInfo, NotionSetupResponse } from "@/types/festival";
import type { PendingOnboardingData } from "@/types/onboarding-pending";

export interface FlushPendingOptions {
  eventbriteUrl?: string;
  eventbrite?: EventbriteEventInfo | null;
  pending?: PendingOnboardingData | null;
  /** Origin for internal API calls, e.g. https://your-app.vercel.app */
  appOrigin: string;
}

export interface FlushPendingResult {
  eventbrite?: boolean;
  eventbriteTiers?: number;
  eventbriteGuests?: number;
  instagram?: number;
  artists?: number;
  errors: string[];
}

async function postJson<T>(
  appOrigin: string,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(`${appOrigin.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, data };
}

export async function flushPendingOnboardingServer(
  workspace: NotionSetupResponse,
  options: FlushPendingOptions,
): Promise<FlushPendingResult> {
  const pending = options.pending ?? null;
  const result: FlushPendingResult = { errors: [] };

  const ticketDbId = workspace.databaseIds["Ticket tiers"];
  const socialDbId = workspace.databaseIds["Social schedule"];
  const funnelDbId = workspace.databaseIds["Instagram engagement funnel"];
  const rosterDbId = workspace.databaseIds["DJ / Artist roster"];

  const eventbriteUrl = resolveEventbriteUrl({
    explicitUrl: options.eventbriteUrl,
    pendingUrl: pending?.eventbriteUrl,
    event: options.eventbrite ?? pending?.eventbrite,
  });

  if (eventbriteUrl && ticketDbId) {
    const body = buildEventbriteSyncBody(workspace, eventbriteUrl);
    if (body) {
      try {
        const { ok, data } = await postJson<EventbriteSyncApiResult>(
          options.appOrigin,
          "/api/eventbrite/sync",
          body,
        );
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
        result.errors.push(
          err instanceof Error ? err.message : "Eventbrite sync failed",
        );
      }
    }
  } else if (options.eventbrite || pending?.eventbrite) {
    result.errors.push(
      "Eventbrite event was imported but no event URL was saved — re-import your Eventbrite link, then deploy again.",
    );
  }

  if (pending?.instagramPosts?.length && socialDbId) {
    try {
      const { ok, data } = await postJson<{ exported?: number; error?: string }>(
        options.appOrigin,
        "/api/instagram/export",
        {
          notionDbId: socialDbId,
          postIds: pending.instagramPosts.map((p) => p.id),
          funnelDbId: funnelDbId || undefined,
          syncAllMetrics: false,
        },
      );
      if (ok) {
        result.instagram = data.exported ?? pending.instagramPosts.length;
      } else {
        result.errors.push(data.error ?? "Instagram export failed");
      }
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : "Instagram export failed",
      );
    }
  }

  if (pending?.artists?.length && rosterDbId) {
    try {
      const statusByArtistId: Record<string, string> = {};
      for (const a of pending.artists) {
        statusByArtistId[a.id] = a.bookingStatus;
      }
      const { ok, data } = await postJson<{ synced?: number; error?: string }>(
        options.appOrigin,
        "/api/spotify/sync",
        {
          notionDbId: rosterDbId,
          artists: pending.artists.map(({ bookingStatus: _s, ...artist }) => artist),
          statusByArtistId,
        },
      );
      if (ok) {
        result.artists = data.synced ?? pending.artists.length;
      } else {
        result.errors.push(data.error ?? "Artist roster sync failed");
      }
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : "Artist roster sync failed",
      );
    }
  }

  return result;
}
