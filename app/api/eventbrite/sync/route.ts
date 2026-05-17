/**
 * Syncs ticket tier data from an Eventbrite event into a Notion database.
 * Clears existing rows then creates fresh ones from Eventbrite ticket classes.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getNotionClient } from "@/lib/notion/client";

const NOTION_VERSION = "2022-06-28";

const bodySchema = z.object({
  eventId: z.string().min(1),
  notionDbId: z.string().min(1),
});

/** Accept a raw numeric ID or a full Eventbrite event URL and return the ID. */
function parseEventbriteId(input: string): string | null {
  const trimmed = input.trim();
  // Plain numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;
  // URL: https://www.eventbrite.com/e/event-name-1234567890 (or with query/hash)
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    const match = last.match(/(\d+)$/);
    if (match) return match[1];
  } catch {
    // not a URL — fall through
  }
  return null;
}

interface EventbriteTicketClass {
  name: string;
  cost?: { major_value: string };
  free: boolean;
  quantity_total: number;
  quantity_sold: number;
}

interface EventbriteResponse {
  ticket_classes?: EventbriteTicketClass[];
  error?: string;
  error_description?: string;
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.EVENTBRITE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "EVENTBRITE_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const resolvedEventId = parseEventbriteId(parsed.data.eventId);
  if (!resolvedEventId) {
    return NextResponse.json(
      {
        error:
          "Could not parse an Eventbrite event ID. Paste the full event URL (e.g. eventbrite.com/e/your-event-1234567890) or just the numeric ID.",
      },
      { status: 400 },
    );
  }

  const { notionDbId } = parsed.data;
  const eventId = resolvedEventId;

  // Fetch ticket classes from Eventbrite
  const ebRes = await fetch(
    `https://www.eventbriteapi.com/v3/events/${eventId}/ticket_classes/`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );

  const ebData = (await ebRes.json()) as EventbriteResponse;

  if (!ebRes.ok) {
    const msg =
      ebData.error_description ?? ebData.error ?? `Eventbrite error ${ebRes.status}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const ticketClasses = ebData.ticket_classes ?? [];
  if (ticketClasses.length === 0) {
    return NextResponse.json(
      { error: "No ticket classes found for this event. Make sure the event has at least one ticket tier." },
      { status: 404 },
    );
  }

  const notion = getNotionClient();
  const notionToken = process.env.NOTION_API_KEY?.trim();

  // Archive all existing rows via the raw REST endpoint (databases.query was
  // removed from @notionhq/client v5; use fetch against the stable REST API).
  if (notionToken) {
    const queryRes = await fetch(
      `https://api.notion.com/v1/databases/${notionDbId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    if (queryRes.ok) {
      const queryData = (await queryRes.json()) as { results: Array<{ id: string }> };
      await Promise.all(
        queryData.results.map((page) =>
          notion.pages.update({ page_id: page.id, archived: true }),
        ),
      );
    }
  }

  // Create a fresh row for each Eventbrite ticket class
  const tiers = await Promise.all(
    ticketClasses.map((tc) => {
      const price = tc.free ? 0 : parseFloat(tc.cost?.major_value ?? "0");
      return notion.pages.create({
        parent: { type: "database_id", database_id: notionDbId },
        properties: {
          Tier: {
            title: [{ type: "text", text: { content: tc.name } }],
          },
          Price: { number: price },
          Capacity: { number: tc.quantity_total },
          Sold: { number: tc.quantity_sold },
        },
      });
    }),
  );

  return NextResponse.json({
    synced: tiers.length,
    tiers: ticketClasses.map((tc) => ({
      name: tc.name,
      price: tc.free ? 0 : parseFloat(tc.cost?.major_value ?? "0"),
      capacity: tc.quantity_total,
      sold: tc.quantity_sold,
    })),
  });
}
