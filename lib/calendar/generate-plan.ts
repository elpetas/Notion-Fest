/**
 * AI planner: marketing post schedule + logistics actions from Notion workspace data.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

import type { FestivalCalendarPlan, NotionWorkspaceSnapshot } from "@/lib/calendar/types";
import { formatSnapshotForPrompt, inferEventDate } from "@/lib/calendar/gather-notion";

const planSchema = z.object({
  summary: z.string().describe("2-3 sentence overview of the calendar strategy"),
  items: z
    .array(
      z.object({
        date: z.string().describe("ISO date YYYY-MM-DD"),
        title: z.string(),
        type: z.enum(["social_post", "logistics", "marketing", "ops"]),
        platform: z
          .enum(["Instagram", "TikTok", "Email", "Twitter / X", "Other"])
          .optional(),
        priority: z.enum(["high", "medium", "low"]),
        description: z.string(),
        logisticsCategory: z.enum(["Merch", "Ops", "Security", "Other"]).optional(),
      }),
    )
    .min(8)
    .max(28),
});

export async function generateFestivalCalendar(input: {
  snapshot: NotionWorkspaceSnapshot;
  weeksBefore?: number;
  weeksAfter?: number;
}): Promise<FestivalCalendarPlan> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const eventDate = inferEventDate(input.snapshot);
  const today = new Date().toISOString().slice(0, 10);
  const weeksBefore = input.weeksBefore ?? 4;
  const weeksAfter = input.weeksAfter ?? 1;

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    schema: planSchema,
    system: `You are a festival producer building an integrated marketing + operations calendar from Notion workspace data.

Rules:
- Use ONLY facts from the workspace snapshot (lineup, ticket sales, dates, existing posts).
- Do NOT duplicate social posts that already have a go-live date unless you are suggesting a follow-up.
- Align post timing with ticket sales end dates and sell-through (urgency before sales end, recap after event).
- Include ~60% social_post/marketing items and ~40% logistics/ops items.
- logistics items must set logisticsCategory (Merch, Ops, Security, or Other).
- social_post items must set platform (mostly Instagram + some TikTok/Email).
- marketing = non-post tasks (approve flyer, email blast prep). ops = staffing, permits, load-in.
- All dates must be >= today (${today}) and within ${weeksBefore} weeks before through ${weeksAfter} week(s) after the event.
- Spread items realistically (not 10 posts on one day).`,
    prompt: `Today: ${today}
Event date: ${eventDate ?? "unknown — infer from ticket/venue context"}
Planning window: ${weeksBefore} weeks before event through ${weeksAfter} week after.

Workspace snapshot:
${formatSnapshotForPrompt(input.snapshot)}

Build the calendar.`,
  });

  const sorted = [...object.items].sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: object.summary,
    eventDate,
    items: sorted,
  };
}
