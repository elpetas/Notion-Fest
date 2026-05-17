import type { NotionSetupResponse } from "@/types/festival";

import { resolveEventbriteUrl } from "./resolve-eventbrite-url";

export interface EventbriteSyncPayload {
  eventId: string;
  notionDbId: string;
  venueDbId?: string;
  attendeesDbId?: string;
}

export function buildEventbriteSyncBody(
  workspace: NotionSetupResponse,
  eventIdOrUrl: string,
): EventbriteSyncPayload | null {
  const ticketDbId = workspace.databaseIds["Ticket tiers"];
  if (!ticketDbId) return null;

  return {
    eventId: eventIdOrUrl,
    notionDbId: ticketDbId,
    ...(workspace.databaseIds.Venues
      ? { venueDbId: workspace.databaseIds.Venues }
      : {}),
    ...(workspace.databaseIds["Attendee list"]
      ? { attendeesDbId: workspace.databaseIds["Attendee list"] }
      : {}),
  };
}

export interface EventbriteSyncApiResult {
  synced?: number;
  venue?: { created: boolean; updated: boolean };
  attendees?: { created: number; updated: number; total: number };
  warnings?: string[];
  error?: string;
}

export async function postEventbriteSync(
  body: EventbriteSyncPayload,
): Promise<{ ok: boolean; data: EventbriteSyncApiResult }> {
  const res = await fetch("/api/eventbrite/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as EventbriteSyncApiResult;
  return { ok: res.ok, data };
}

export function resolveAndBuildSync(
  workspace: NotionSetupResponse,
  sources: Parameters<typeof resolveEventbriteUrl>[0],
): EventbriteSyncPayload | null {
  const eventIdOrUrl = resolveEventbriteUrl(sources);
  if (!eventIdOrUrl) return null;
  return buildEventbriteSyncBody(workspace, eventIdOrUrl);
}
