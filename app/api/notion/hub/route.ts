/**
 * POST /api/notion/hub — write briefings, todos, charts, status, or regenerate hub structure.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getNotionClient } from "@/lib/notion/client";
import { defaultMetricsChartUrl } from "@/lib/notion/blocks";
import {
  appendAgentBriefing,
  appendChartEmbed,
  appendHubStructure,
  appendTodoItems,
  generateAndWriteStatusReport,
  workspaceDbIdsFromRecord,
} from "@/lib/notion/hub";

const festivalSettingsSchema = z.object({
  budget: z.string().min(1),
  genre: z.string().min(1),
  dateRange: z.string().min(1),
  vibe: z.string().min(1),
});

const bodySchema = z.object({
  action: z.enum(["briefing", "todo", "chart", "status", "regenerate"]),
  hubPageId: z.string().min(1),
  databaseIds: z.record(z.string(), z.string()).optional(),
  payload: z
    .object({
      text: z.string().optional(),
      items: z.array(z.string()).optional(),
      chartUrl: z.string().url().optional(),
      settings: festivalSettingsSchema.optional(),
    })
    .optional(),
});

export async function POST(req: Request): Promise<Response> {
  if (!process.env.NOTION_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "NOTION_API_KEY is not configured" },
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

  const { action, hubPageId, databaseIds = {}, payload } = parsed.data;

  try {
    const notion = getNotionClient();

    switch (action) {
      case "briefing": {
        const text = payload?.text?.trim();
        if (!text) {
          return NextResponse.json(
            { error: "payload.text is required for briefing" },
            { status: 400 },
          );
        }
        const result = await appendAgentBriefing(notion, hubPageId, text);
        return NextResponse.json({ ok: true, ...result });
      }

      case "todo": {
        const items = payload?.items ?? [];
        if (items.length === 0) {
          return NextResponse.json(
            { error: "payload.items is required for todo" },
            { status: 400 },
          );
        }
        const result = await appendTodoItems(notion, hubPageId, items);
        return NextResponse.json({ ok: true, ...result });
      }

      case "chart": {
        const chartUrl = payload?.chartUrl ?? defaultMetricsChartUrl();
        const result = await appendChartEmbed(notion, hubPageId, chartUrl);
        return NextResponse.json({ ok: true, chartUrl, ...result });
      }

      case "status": {
        const dbIds = workspaceDbIdsFromRecord(hubPageId, databaseIds);
        const result = await generateAndWriteStatusReport(
          notion,
          hubPageId,
          dbIds,
        );
        return NextResponse.json({
          ok: true,
          reportLength: result.report.length,
          appended: result.appended,
        });
      }

      case "regenerate": {
        const settings = payload?.settings;
        if (!settings) {
          return NextResponse.json(
            {
              error:
                "payload.settings (budget, genre, dateRange, vibe) is required for regenerate",
            },
            { status: 400 },
          );
        }
        const result = await appendHubStructure(notion, hubPageId, settings);
        return NextResponse.json({ ok: true, ...result });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "hub write failed";
    console.error("notion hub error", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
