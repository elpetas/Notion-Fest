/**
 * Returns unpublished Instagram posts from the Notion "Social schedule" database.
 * GET /api/instagram/pending?notionDbId=<id>
 *
 * Filters for rows where Platform = "Instagram" and Published = false.
 */

import { NextResponse } from "next/server";

const NOTION_VERSION = "2022-06-28";

interface NotionRichTextItem {
  plain_text: string;
}

interface NotionPage {
  id: string;
  properties: {
    Post?: { title?: NotionRichTextItem[] };
    Platform?: { select?: { name: string } | null };
    "Go-live"?: { date?: { start: string } | null };
    Published?: { checkbox?: boolean };
    Notes?: { rich_text?: NotionRichTextItem[] };
  };
}

interface NotionQueryResponse {
  results: NotionPage[];
  message?: string;
}

export async function GET(req: Request): Promise<Response> {
  const notionToken = process.env.NOTION_API_KEY?.trim();
  if (!notionToken) {
    return NextResponse.json(
      { error: "NOTION_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const notionDbId = searchParams.get("notionDbId")?.trim();

  if (!notionDbId) {
    return NextResponse.json(
      { error: "notionDbId query parameter is required" },
      { status: 400 },
    );
  }

  const res = await fetch(
    `https://api.notion.com/v1/databases/${notionDbId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Platform", select: { equals: "Instagram" } },
            { property: "Published", checkbox: { equals: false } },
          ],
        },
        sorts: [{ property: "Go-live", direction: "ascending" }],
      }),
    },
  );

  const data = (await res.json()) as NotionQueryResponse;

  if (!res.ok) {
    return NextResponse.json(
      { error: data.message ?? `Notion query error ${res.status}` },
      { status: 502 },
    );
  }

  const posts = data.results.map((page) => ({
    id: page.id,
    caption: page.properties.Post?.title?.map((t) => t.plain_text).join("") ?? "",
    goLive: page.properties["Go-live"]?.date?.start ?? null,
    notes: page.properties.Notes?.rich_text?.map((t) => t.plain_text).join("") ?? "",
  }));

  return NextResponse.json({ posts });
}
