/**
 * Creates the festival Notion hub + databases from confirmed festival settings.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getNotionClient } from "@/lib/notion/client";
import { normalizeNotionPageId, scaffoldFestivalWorkspace } from "@/lib/notion/scaffold";
import type { FestivalSettings } from "@/types/festival";

const bodySchema = z.object({
  budget: z.string().min(1),
  genre: z.string().min(1),
  dateRange: z.string().min(1),
  vibe: z.string().min(1),
  /** optional parent page URL or id — overrides NOTION_PAGE_ID when set */
  parentPageUrl: z.string().optional(),
  /** optional hub page title — defaults to "Festival hub — {genre}" */
  hubTitle: z.string().optional(),
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

  const parentRaw =
    parsed.data.parentPageUrl?.trim() ||
    process.env.NOTION_PAGE_ID?.trim() ||
    "";
  if (!parentRaw) {
    return NextResponse.json(
      {
        error:
          "Parent Notion page missing — paste its URL on the home page or set NOTION_PAGE_ID.",
      },
      { status: 400 },
    );
  }

  try {
    const notion = getNotionClient();
    const settings: FestivalSettings = {
      budget: parsed.data.budget,
      genre: parsed.data.genre,
      dateRange: parsed.data.dateRange,
      vibe: parsed.data.vibe,
    };
    const hubTitleOpt = parsed.data.hubTitle?.trim();
    const result = await scaffoldFestivalWorkspace(
      notion,
      normalizeNotionPageId(parentRaw),
      settings,
      hubTitleOpt ? { hubTitle: hubTitleOpt } : undefined,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "notion setup failed";
    console.error("notion setup error", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
