/**
 * Creates the festival Notion hub + databases from confirmed festival settings.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getNotionClient } from "@/lib/notion/client";
import { normalizeNotionPageId, scaffoldFestivalWorkspace } from "@/lib/notion/scaffold";

const bodySchema = z.object({
  budget: z.string().min(1),
  genre: z.string().min(1),
  dateRange: z.string().min(1),
  vibe: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const parentRaw = process.env.NOTION_PAGE_ID?.trim();
  if (!parentRaw) {
    return NextResponse.json(
      { error: "NOTION_PAGE_ID is not configured" },
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

  try {
    const notion = getNotionClient();
    const result = await scaffoldFestivalWorkspace(
      notion,
      normalizeNotionPageId(parentRaw),
      parsed.data,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "notion setup failed";
    console.error("notion setup error", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
