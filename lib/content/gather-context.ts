/**
 * Builds a unified context object from Eventbrite, Notion roster, and optional festival settings.
 */

import {
  fetchEventSummary,
  fetchTicketClasses,
  parseEventbriteId,
} from "@/lib/eventbrite/client";
import { deriveSalesTone } from "@/lib/content/sales-tone";
import type { FestivalDraftContext, RosterArtistContext } from "@/lib/content/types";
import { queryDatabasePages, richTextPlain, titlePlain } from "@/lib/notion/query";

export async function loadRosterFromNotion(
  rosterDbId: string,
  limit = 8,
): Promise<RosterArtistContext[]> {
  const pages = await queryDatabasePages(rosterDbId);
  return pages.slice(0, limit).map((page) => ({
    name: titlePlain(page.properties, "Artist") || "Unknown artist",
    notes: richTextPlain(page.properties, "Set notes"),
  }));
}

export async function gatherFestivalDraftContext(input: {
  eventId: string;
  rosterDbId?: string;
  genre?: string;
  vibe?: string;
}): Promise<FestivalDraftContext> {
  const parsedId = parseEventbriteId(input.eventId);
  if (!parsedId) {
    throw new Error("Invalid Eventbrite event ID or URL");
  }

  const [event, tiers] = await Promise.all([
    fetchEventSummary(parsedId),
    fetchTicketClasses(parsedId),
  ]);

  const toneResult = deriveSalesTone(event, tiers);

  let artists: RosterArtistContext[] = [];
  if (input.rosterDbId?.trim()) {
    try {
      artists = await loadRosterFromNotion(input.rosterDbId.trim());
    } catch {
      artists = [];
    }
  }

  return {
    event,
    tiers,
    artists,
    tone: toneResult.tone,
    toneLabel: toneResult.label,
    toneGuidance: toneResult.guidance,
    daysUntilEvent: toneResult.daysUntilEvent,
    daysUntilSalesEnd: toneResult.daysUntilSalesEnd,
    sellThroughPct: toneResult.sellThroughPct,
    genre: input.genre?.trim() || undefined,
    vibe: input.vibe?.trim() || undefined,
  };
}
