/**
 * Analyzes Notion workspace and generates a marketing + logistics calendar.
 * POST /api/calendar/plan
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { applyCalendarToNotion } from "@/lib/calendar/apply-notion";
import { generateFestivalCalendar } from "@/lib/calendar/generate-plan";
import { gatherNotionWorkspace } from "@/lib/calendar/gather-notion";

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
  const hasDb =
    input.ticketTiersDbId ||
    input.venuesDbId ||
    input.socialDbId ||
    input.rosterDbId;

  if (!hasDb) {
    return NextResponse.json(
      { error: "Provide at least one Notion database ID (ticket tiers, venues, social, or roster)." },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    const snapshot = await gatherNotionWorkspace({
      hubPageId: input.hubPageId,
      venuesDbId: input.venuesDbId,
      ticketTiersDbId: input.ticketTiersDbId,
      rosterDbId: input.rosterDbId,
      socialDbId: input.socialDbId,
      logisticsDbId: input.logisticsDbId,
      adCopiesDbId: input.adCopiesDbId,
      flyerDbId: input.flyerDbId,
    });

    const plan = await generateFestivalCalendar({
      snapshot,
      weeksBefore: input.weeksBefore,
      weeksAfter: input.weeksAfter,
    });

    let applied = null;
    if (input.writeToNotion) {
      applied = await applyCalendarToNotion(plan, {
        socialDbId: input.socialDbId,
        logisticsDbId: input.logisticsDbId,
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
