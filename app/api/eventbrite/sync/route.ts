/**
 * Full Eventbrite sync into Notion festival databases.
 * POST /api/eventbrite/sync
 *
 * Body:
 *   eventId — URL or numeric ID
 *   notionDbId — Ticket tiers database (required)
 *   venueDbId? — Venues database (event + venue row)
 *   attendeesDbId? — Attendee list database (guest list)
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  fetchAllAttendees,
  fetchEventSummary,
  fetchTicketClasses,
  parseEventbriteId,
} from "@/lib/eventbrite/client";
import { getNotionClient } from "@/lib/notion/client";
import { findPageByEbId, queryDatabasePages } from "@/lib/notion/query";

const NOTION_VERSION = "2022-06-28";

const bodySchema = z.object({
  eventId: z.string().min(1),
  notionDbId: z.string().min(1),
  venueDbId: z.string().optional(),
  attendeesDbId: z.string().optional(),
});

function rt(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, 2000) } }];
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
  }
  return err instanceof Error ? err.message : "Eventbrite sync failed";
}

/** Notion Venues DB only allows Idea | Shortlist | Booked */
function mapVenueStatus(eventStatus: string): "Idea" | "Shortlist" | "Booked" {
  const s = eventStatus.toLowerCase();
  if (s === "live" || s === "started" || s === "ended" || s === "completed") {
    return "Booked";
  }
  return "Shortlist";
}

async function archiveDatabaseRows(databaseId: string): Promise<void> {
  const notion = getNotionClient();
  const token = process.env.NOTION_API_KEY?.trim();
  if (!token) return;

  const pages = await queryDatabasePages(databaseId);
  await Promise.all(
    pages.map((page) => notion.pages.update({ page_id: page.id, archived: true })),
  );
}

function compactProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, v]) => v !== undefined),
  );
}

async function upsertByEbId(
  databaseId: string,
  ebId: string,
  properties: Record<string, unknown>,
): Promise<"created" | "updated"> {
  const notion = getNotionClient();
  const existingId = await findPageByEbId(databaseId, ebId);
  const props = {
    ...compactProperties(properties),
    "EB ID": { rich_text: rt(ebId) },
  };

  if (existingId) {
    await notion.pages.update({
      page_id: existingId,
      properties: props as Parameters<typeof notion.pages.update>[0]["properties"],
    });
    return "updated";
  }

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
  });
  return "created";
}

export async function POST(req: Request): Promise<Response> {
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

  const eventId = parseEventbriteId(parsed.data.eventId);
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
    const [event, ticketClasses] = await Promise.all([
      fetchEventSummary(eventId),
      fetchTicketClasses(eventId),
    ]);

    const notion = getNotionClient();
    const { notionDbId, venueDbId, attendeesDbId } = parsed.data;
    const warnings: string[] = [];

    // ── Ticket tiers (replace all rows) ─────────────────────────────────────
    let tierCount = 0;
    if (ticketClasses.length === 0) {
      warnings.push("No ticket classes on Eventbrite — skipped ticket tiers.");
    } else {
      try {
        await archiveDatabaseRows(notionDbId);

        for (const tc of ticketClasses) {
          const price = tc.free ? 0 : parseFloat(tc.cost?.major_value ?? "0");
          const remaining = Math.max(0, tc.quantity_total - tc.quantity_sold);
          const properties: Record<string, unknown> = {
            Tier: { title: rt(tc.name) },
            Price: { number: price },
            Capacity: { number: tc.quantity_total },
            Sold: { number: tc.quantity_sold },
            Remaining: { number: remaining },
            "EB ID": { rich_text: rt(tc.id) },
          };

          if (tc.on_sale_status) {
            properties["On sale status"] = { rich_text: rt(tc.on_sale_status) };
          }
          if (tc.sales_end) {
            properties["Sales end"] = { date: { start: tc.sales_end } };
          }
          if (tc.description) {
            properties.Perks = { rich_text: rt(tc.description) };
          }

          await notion.pages.create({
            parent: { database_id: notionDbId },
            properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
          });
          tierCount += 1;
        }
      } catch (tierErr) {
        warnings.push(`Ticket tiers sync failed: ${errorMessage(tierErr)}`);
      }
    }

    // ── Venue / event row ───────────────────────────────────────────────────
    let venueResult: { created: boolean; updated: boolean } | null = null;
    if (venueDbId) {
      try {
        const venueTitle = event.venueName || event.name;
        const notes = [
          event.url ? `Eventbrite: ${event.url}` : null,
          event.status ? `Status: ${event.status}` : null,
          event.isSoldOut ? "SOLD OUT" : null,
          event.description ? event.description.slice(0, 500) : null,
        ]
          .filter(Boolean)
          .join("\n");

        const result = await upsertByEbId(venueDbId, event.id, {
          Name: { title: rt(venueTitle) },
          Capacity: {
            number: event.venueCapacity ?? event.capacity ?? 0,
          },
          Notes: { rich_text: rt(notes) },
          Status: {
            select: {
              name: mapVenueStatus(event.status),
            },
          },
          "Event URL": event.url ? { url: event.url } : undefined,
          "Event start": event.startUtc ? { date: { start: event.startUtc } } : undefined,
          "Event end": event.endUtc ? { date: { start: event.endUtc } } : undefined,
        });

        venueResult = {
          created: result === "created",
          updated: result === "updated",
        };
      } catch (venueErr) {
        warnings.push(`Venue sync failed: ${errorMessage(venueErr)}`);
      }
    }

    // ── Attendees (upsert by EB ID) ─────────────────────────────────────────
    let attendeesResult: { created: number; updated: number; total: number } | null =
      null;
    if (attendeesDbId) {
      try {
        const attendees = await fetchAllAttendees(eventId);
        let created = 0;
        let updated = 0;

        for (const a of attendees) {
          const statusName = a.checkedIn
            ? "Checked in"
            : a.status?.toLowerCase().includes("cancel")
              ? "Cancelled"
              : "Registered";

          const result = await upsertByEbId(attendeesDbId, a.id, {
            Name: { title: rt(a.name) },
            Email: a.email ? { email: a.email } : undefined,
            "Ticket tier": { rich_text: rt(a.ticketClassName) },
            Status: { select: { name: statusName } },
            "Checked in": { checkbox: a.checkedIn },
            "Order date": a.created ? { date: { start: a.created } } : undefined,
          });
          if (result === "created") created += 1;
          else updated += 1;
        }

        attendeesResult = { created, updated, total: attendees.length };
      } catch (attendeesErr) {
        warnings.push(`Guest list sync failed: ${errorMessage(attendeesErr)}`);
      }
    }

    const didSync =
      tierCount > 0 || venueResult != null || (attendeesResult?.total ?? 0) > 0;
    if (!didSync && warnings.length === 0) {
      return NextResponse.json(
        { error: "Nothing to sync for this event (no tiers, venue, or guests)." },
        { status: 404 },
      );
    }

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
        isSoldOut: event.isSoldOut,
        capacity: event.capacity,
      },
      tiers: ticketClasses.map((tc) => ({
        name: tc.name,
        price: tc.free ? 0 : parseFloat(tc.cost?.major_value ?? "0"),
        capacity: tc.quantity_total,
        sold: tc.quantity_sold,
        remaining: Math.max(0, tc.quantity_total - tc.quantity_sold),
        onSaleStatus: tc.on_sale_status ?? null,
        salesEnd: tc.sales_end ?? null,
      })),
      synced: tierCount,
      venue: venueResult,
      attendees: attendeesResult,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    const message = errorMessage(err);
    const status = message.includes("not configured") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
