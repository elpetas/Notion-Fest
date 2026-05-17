/**
 * Analyzes Notion workspace and generates a marketing + logistics calendar.
 * POST /api/calendar/plan
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { applyCalendarToNotion } from "@/lib/calendar/apply-notion";
import { generateFestivalCalendar } from "@/lib/calendar/generate-plan";
import { gatherNotionWorkspace } from "@/lib/calendar/gather-notion";
import {
  discoverDatabasesFromHub,
  mergeWithDiscovered,
} from "@/lib/notion/discover-databases";

const bodySchema = z.object({
  hubPageId: z.string().optional(),
  venuesDbId: z.string().optional(),
  ticketTiersDbId: z.string().optional(),
  rosterDbId: z.string().optional(),
  socialDbId: z.string().optional(),
  logisticsDbId: z.string().optional(),
  adCopiesDbId: z.string().optional(),
  flyerDbId: z.string().optional(),
  writeToNotion: z.boolean().default(false),
  weeksBefore: z.number().min(1).max(12).default(4),
  weeksAfter: z.number().min(0).max(4).default(1),
});

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

  const input = parsed.data;

  let resolvedHubPageId = input.hubPageId;
  let resolvedDbs = {
    venuesDbId: input.venuesDbId,
    ticketTiersDbId: input.ticketTiersDbId,
    rosterDbId: input.rosterDbId,
    socialDbId: input.socialDbId,
    logisticsDbId: input.logisticsDbId,
    adCopiesDbId: input.adCopiesDbId,
    flyerDbId: input.flyerDbId,
  };

  // Hackathon demo mode: if nothing provided, auto-discover everything
  const hasAnyId =
    resolvedHubPageId ||
    resolvedDbs.ticketTiersDbId ||
    resolvedDbs.venuesDbId ||
    resolvedDbs.socialDbId ||
    resolvedDbs.rosterDbId;

  if (!hasAnyId) {
    try {
      const { autoDiscoverEverything } = await import(
        "@/lib/notion/discover-databases"
      );
      const discovered = await autoDiscoverEverything();
      resolvedHubPageId = discovered.hubPageId;
      resolvedDbs = mergeWithDiscovered(resolvedDbs, discovered.databases);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Auto-discovery failed: ${err instanceof Error ? err.message : "unknown error"}`,
        },
        { status: 500 },
      );
    }
  } else if (resolvedHubPageId) {
    // If hub page ID provided, discover databases from it
    try {
      const discovered = await discoverDatabasesFromHub(resolvedHubPageId);
      resolvedDbs = mergeWithDiscovered(resolvedDbs, discovered);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Failed to discover databases from hub page: ${err instanceof Error ? err.message : "unknown error"}`,
        },
        { status: 500 },
      );
    }
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    const snapshot = await gatherNotionWorkspace({
      hubPageId: resolvedHubPageId,
      venuesDbId: resolvedDbs.venuesDbId,
      ticketTiersDbId: resolvedDbs.ticketTiersDbId,
      rosterDbId: resolvedDbs.rosterDbId,
      socialDbId: resolvedDbs.socialDbId,
      logisticsDbId: resolvedDbs.logisticsDbId,
      adCopiesDbId: resolvedDbs.adCopiesDbId,
      flyerDbId: resolvedDbs.flyerDbId,
    });

    const plan = await generateFestivalCalendar({
      snapshot,
      weeksBefore: input.weeksBefore,
      weeksAfter: input.weeksAfter,
    });

    let applied = null;
    if (input.writeToNotion) {
      applied = await applyCalendarToNotion(plan, {
        socialDbId: resolvedDbs.socialDbId,
        logisticsDbId: resolvedDbs.logisticsDbId,
      });
    }

    return NextResponse.json({
      ok: true,
      plan,
      snapshotSummary: {
        eventDate: plan.eventDate,
        venueCount: snapshot.venues.length,
        tierCount: snapshot.ticketTiers.length,
        rosterCount: snapshot.roster.length,
        existingSocial: snapshot.socialScheduled.length,
        openLogistics: snapshot.logisticsOpen.length,
      },
      applied,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calendar planning failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
