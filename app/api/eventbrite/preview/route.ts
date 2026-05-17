/**
 * Lightweight Eventbrite event preview (no Notion writes).
 * GET /api/eventbrite/preview?eventId=<url or id>
 */

import { NextResponse } from "next/server";

import { fetchEventSummary, parseEventbriteId } from "@/lib/eventbrite/client";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("eventId")?.trim();

  if (!raw) {
    return NextResponse.json(
      { error: "eventId query parameter is required" },
      { status: 400 },
    );
  }

  const eventId = parseEventbriteId(raw);
  if (!eventId) {
    return NextResponse.json(
      {
        error:
          "Could not parse an Eventbrite event ID. Paste the full event URL or numeric ID.",
      },
      { status: 400 },
    );
  }

  try {
    const event = await fetchEventSummary(eventId);
    return NextResponse.json({
      event: {
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
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Eventbrite preview failed";
    const status = message.includes("not configured") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
