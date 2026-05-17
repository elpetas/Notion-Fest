/**
 * Writes calendar plan items into Notion Social schedule and logistics checklist.
 */

import { getNotionClient } from "@/lib/notion/client";
import type { CalendarPlanItem, FestivalCalendarPlan } from "@/lib/calendar/types";

function rt(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, 2000) } }];
}

export interface ApplyCalendarResult {
  socialCreated: number;
  logisticsCreated: number;
  skipped: number;
}

export async function applyCalendarToNotion(
  plan: FestivalCalendarPlan,
  ids: { socialDbId?: string; logisticsDbId?: string },
): Promise<ApplyCalendarResult> {
  const notion = getNotionClient();
  let socialCreated = 0;
  let logisticsCreated = 0;
  let skipped = 0;

  for (const item of plan.items) {
    if (item.type === "social_post" && ids.socialDbId?.trim()) {
      await createSocialRow(notion, ids.socialDbId.trim(), item);
      socialCreated++;
      continue;
    }

    if (
      (item.type === "logistics" || item.type === "ops") &&
      ids.logisticsDbId?.trim()
    ) {
      await createLogisticsRow(notion, ids.logisticsDbId.trim(), item);
      logisticsCreated++;
      continue;
    }

    if (item.type === "marketing" && ids.socialDbId?.trim()) {
      await createSocialRow(notion, ids.socialDbId.trim(), item, "Other");
      socialCreated++;
      continue;
    }

    skipped++;
  }

  return { socialCreated, logisticsCreated, skipped };
}

async function createSocialRow(
  notion: ReturnType<typeof getNotionClient>,
  databaseId: string,
  item: CalendarPlanItem,
  platformOverride?: CalendarPlanItem["platform"],
) {
  const platform =
    platformOverride ??
    item.platform ??
    (item.type === "social_post" ? "Instagram" : "Other");

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Post: {
        title: [{ type: "text", text: { content: item.title.slice(0, 200) } }],
      },
      Platform: { select: { name: platform } },
      Published: { checkbox: false },
      "Go-live": { date: { start: item.date } },
      Notes: {
        rich_text: rt(
          `[${item.type} · ${item.priority}] ${item.description}\n\nSuggested by AI calendar planner.`,
        ),
      },
    },
  });
}

async function createLogisticsRow(
  notion: ReturnType<typeof getNotionClient>,
  databaseId: string,
  item: CalendarPlanItem,
) {
  const category = item.logisticsCategory ?? "Ops";
  const properties: Record<string, unknown> = {
    Item: {
      title: [{ type: "text", text: { content: item.title.slice(0, 200) } }],
    },
    Category: { select: { name: category } },
    Done: { checkbox: false },
    Notes: {
      rich_text: rt(
        `[${item.priority}] ${item.description}\n\nSuggested by AI calendar planner.`,
      ),
    },
  };

  // Due date — works on new workspaces; ignored if property missing (caller may catch)
  properties.Due = { date: { start: item.date } };

  try {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
    });
  } catch {
    delete properties.Due;
    properties.Notes = {
      rich_text: rt(
        `Due: ${item.date}\n[${item.priority}] ${item.description}\n\nSuggested by AI calendar planner.`,
      ),
    };
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
    });
  }
}
