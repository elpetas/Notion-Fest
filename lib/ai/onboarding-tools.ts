/**
 * Chat onboarding tools — Eventbrite import, Instagram picker, artist roster.
 */

import { tool } from "ai";
import { z } from "zod";

import {
  fetchEventSummary,
  parseEventbriteId,
} from "@/lib/eventbrite/client";
import { getNotionClient } from "@/lib/notion/client";
import { appendAgentBriefing } from "@/lib/notion/hub";
import type { EventbriteEventInfo, NotionSetupResponse } from "@/types/festival";

function formatEventDates(startUtc: string, endUtc: string): string {
  if (!startUtc) return "Dates TBD";
  const start = new Date(startUtc);
  const end = endUtc ? new Date(endUtc) : null;
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const startStr = start.toLocaleDateString(undefined, opts);
  if (!end || start.toDateString() === end.toDateString()) {
    return startStr;
  }
  return `${startStr} – ${end.toLocaleDateString(undefined, opts)}`;
}

function toEventInfo(
  event: Awaited<ReturnType<typeof fetchEventSummary>>,
): EventbriteEventInfo {
  return {
    id: event.id,
    name: event.name,
    status: event.status,
    url: event.url,
    startUtc: event.startUtc,
    endUtc: event.endUtc,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    capacity: event.capacity,
    venueCapacity: event.venueCapacity,
    isSoldOut: event.isSoldOut,
  };
}

export function buildOnboardingSystemPrompt(
  basePrompt: string,
  workspace?: NotionSetupResponse,
): string {
  const hubNote = workspace?.hubPageId
    ? "A Notion festival hub is connected — selections can sync to Notion immediately from the inline UIs."
    : "No Notion hub exists yet. The user saves Eventbrite, Instagram, and artist picks locally during onboarding; everything syncs to Notion when they click Deploy Worker at the end. Do not tell them they need a workspace connected before saving selections.";

  return `${basePrompt}

## Onboarding flow (follow in order)

You are guiding the organizer through hub setup. ${hubNote}

1. **Eventbrite (first)** — On your very first reply, greet them briefly and call \`presentEventbriteLink\` so the inline import UI appears. Ask them to paste their Eventbrite event URL. When they paste a link in chat, call \`importEventbriteEvent\` with that URL.
2. **Instagram** — After Eventbrite is imported, call \`presentInstagramPostPicker\`. Wait until they click Save in the UI. Comments and funnel data sync when the hub is created (or immediately if a hub is already connected).
3. **Artists** — Call \`presentArtistRosterPicker\` so they can search Spotify artists, set booking status (wishlist / pending / booked), and save their roster.
4. **Festival settings** — When the three steps are done, call \`presentFestivalSettingsForm\` so they can enter budget, genre, dates, and vibe in the inline form (pre-fill dates/vibe from Eventbrite when possible). Do not ask them to use any panel outside the chat thread.
5. **Deploy** — After they submit the form, remind them to click **Deploy Worker** below the chat to create their Notion hub and sync all saved data.

Rules:
- Call \`presentEventbriteLink\` on your first message.
- Do not call \`presentFestivalSettingsForm\` until Eventbrite, Instagram export, and artist roster steps are complete.
- After settings are submitted in the form, do not re-ask for budget or vibe.
- After each interactive UI step, acknowledge what was synced and introduce the next step.`;
}

export function createOnboardingTools(workspace?: NotionSetupResponse) {
  const presentEventbriteLink = tool({
    description:
      "Show the Eventbrite URL import UI in chat. Call this on your first message to start onboarding.",
    inputSchema: z.object({}),
    execute: async () => ({ action: "eventbrite_form" as const }),
  });

  const importEventbriteEvent = tool({
    description:
      "Import an Eventbrite event by URL or ID. Fetches festival name, dates, venue, and capacity. Syncs ticket tiers and venue into Notion when a hub is connected.",
    inputSchema: z.object({
      eventUrl: z.string().min(1).describe("Full Eventbrite event URL or numeric event ID"),
    }),
    execute: async ({ eventUrl }) => {
      const eventId = parseEventbriteId(eventUrl);
      if (!eventId) {
        return {
          ok: false as const,
          error:
            "Could not parse an Eventbrite event ID. Paste the full event URL or numeric ID.",
        };
      }

      const summary = await fetchEventSummary(eventId);
      const event = toEventInfo(summary);
      const dateRange = formatEventDates(event.startUtc, event.endUtc);
      const capacity = event.capacity ?? event.venueCapacity;

      let synced: { tiers?: number; venue?: boolean } | undefined;

      if (workspace?.databaseIds) {
        const ticketDbId = workspace.databaseIds["Ticket tiers"];
        if (ticketDbId) {
          const origin = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

          const res = await fetch(`${origin}/api/eventbrite/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId: eventUrl,
              notionDbId: ticketDbId,
              ...(workspace.databaseIds.Venues
                ? { venueDbId: workspace.databaseIds.Venues }
                : {}),
              ...(workspace.databaseIds["Attendee list"]
                ? { attendeesDbId: workspace.databaseIds["Attendee list"] }
                : {}),
            }),
          });
          const data = (await res.json()) as {
            synced?: number;
            venue?: { created: boolean; updated: boolean };
            error?: string;
          };
          if (res.ok) {
            synced = {
              tiers: data.synced,
              venue: Boolean(data.venue?.created || data.venue?.updated),
            };
          }
        }

        if (workspace.hubPageId) {
          const notion = getNotionClient();
          const capLabel =
            capacity != null ? `${capacity.toLocaleString()} capacity` : "capacity TBD";
          await appendAgentBriefing(
            notion,
            workspace.hubPageId,
            `Eventbrite linked: ${event.name}\n${dateRange} · ${event.venueName || "Venue TBD"} · ${capLabel}`,
          );
        }
      }

      return {
        ok: true as const,
        event,
        dateRange,
        capacity,
        synced,
      };
    },
  });

  const presentInstagramPostPicker = tool({
    description:
      "Show Instagram post picker UI. User selects posts to export to the Social schedule; comments and funnel sync run automatically.",
    inputSchema: z.object({}),
    execute: async () => ({ action: "instagram_picker" as const }),
  });

  const presentArtistRosterPicker = tool({
    description:
      "Show Spotify artist search UI with booking status (wishlist, pending, booked) and export to DJ roster.",
    inputSchema: z.object({}),
    execute: async () => ({ action: "artist_picker" as const }),
  });

  const presentFestivalSettingsForm = tool({
    description:
      "Show inline budget, genre, dates, and vibe form in chat. Call after Eventbrite, Instagram, and artist steps are complete.",
    inputSchema: z.object({}),
    execute: async () => ({ action: "festival_settings_form" as const }),
  });

  return {
    presentEventbriteLink,
    importEventbriteEvent,
    presentInstagramPostPicker,
    presentArtistRosterPicker,
    presentFestivalSettingsForm,
  };
}
