/**
 * Syncs Instagram post metrics into the Notion Social schedule database.
 * POST /api/instagram/metrics/sync
 * Body: { notionDbId: string }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getInstagramCredentials } from "@/lib/instagram/config";
import { fetchPostsWithInsights } from "@/lib/instagram/graph";
import { getNotionClient } from "@/lib/notion/client";
import { queryDatabasePages, richTextPlain } from "@/lib/notion/query";

const bodySchema = z.object({
  notionDbId: z.string().min(1),
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

  try {
    getInstagramCredentials();
    const posts = await fetchPostsWithInsights(25);
    const notion = getNotionClient();
    const pages = await queryDatabasePages(parsed.data.notionDbId);

    const byIgId = new Map<string, string>();
    for (const page of pages) {
      const igPostId = richTextPlain(page.properties, "IG Post ID");
      if (igPostId) byIgId.set(igPostId, page.id);
    }

    let updated = 0;
    let created = 0;

    for (const post of posts) {
      const properties = {
        Views: { number: post.views },
        Reach: { number: post.reach },
        Saves: { number: post.saved },
        Likes: { number: post.likes },
        "IG Post ID": {
          rich_text: [{ type: "text" as const, text: { content: post.id } }],
        },
        Permalink: { url: post.permalink },
        Published: { checkbox: true },
        Platform: { select: { name: "Instagram" } },
      };

      const existingId = byIgId.get(post.id);
      if (existingId) {
        await notion.pages.update({
          page_id: existingId,
          properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
        });
        updated += 1;
      } else {
        const title =
          post.caption.slice(0, 80) || `Instagram post ${new Date(post.timestamp).toLocaleDateString()}`;
        await notion.pages.create({
          parent: { database_id: parsed.data.notionDbId },
          properties: {
            Post: { title: [{ type: "text", text: { content: title } }] },
            ...properties,
          } as Parameters<typeof notion.pages.create>[0]["properties"],
        });
        created += 1;
      }
    }

    return NextResponse.json({ updated, created, total: posts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Metrics sync failed";
    const status = message.includes("must be configured") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
