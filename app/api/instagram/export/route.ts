/**
 * Export selected Instagram posts to Social schedule; optionally sync comments (funnel).
 * POST /api/instagram/export
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getInstagramCredentials } from "@/lib/instagram/config";
import { fetchPostsWithInsights } from "@/lib/instagram/graph";
import { getNotionClient } from "@/lib/notion/client";
import { queryDatabasePages, richTextPlain } from "@/lib/notion/query";

const bodySchema = z.object({
  notionDbId: z.string().min(1),
  postIds: z.array(z.string().min(1)).min(1),
  funnelDbId: z.string().optional(),
  syncFunnel: z.boolean().optional().default(true),
  syncAllMetrics: z.boolean().optional().default(false),
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

  const { notionDbId, postIds, funnelDbId, syncFunnel, syncAllMetrics } = parsed.data;
  const selected = new Set(postIds);

  try {
    getInstagramCredentials();
    const posts = await fetchPostsWithInsights(25);
    const toExport = posts.filter((p) => selected.has(p.id));

    if (toExport.length === 0) {
      return NextResponse.json(
        { error: "None of the selected post IDs were found on your Instagram account." },
        { status: 404 },
      );
    }

    const notion = getNotionClient();
    const pages = await queryDatabasePages(notionDbId);
    const byIgId = new Map<string, string>();
    for (const page of pages) {
      const igPostId = richTextPlain(page.properties, "IG Post ID");
      if (igPostId) byIgId.set(igPostId, page.id);
    }

    let exported = 0;
    let updated = 0;
    let created = 0;

    for (const post of toExport) {
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
          post.caption.slice(0, 80) ||
          `Instagram post ${new Date(post.timestamp).toLocaleDateString()}`;
        await notion.pages.create({
          parent: { database_id: notionDbId },
          properties: {
            Post: { title: [{ type: "text", text: { content: title } }] },
            Notes: post.caption
              ? {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: post.caption.slice(0, 2000) },
                    },
                  ],
                }
              : undefined,
            ...properties,
          } as Parameters<typeof notion.pages.create>[0]["properties"],
        });
        created += 1;
      }
      exported += 1;
    }

    let funnel: { comments?: { created: number; updated: number }; warnings?: string[] } | null =
      null;
    let metrics: { updated: number; created: number } | null = null;

    if (syncFunnel && funnelDbId?.trim()) {
      const origin = new URL(req.url).origin;
      const funnelRes = await fetch(`${origin}/api/instagram/funnel/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionDbId: funnelDbId.trim() }),
      });
      const funnelData = (await funnelRes.json()) as {
        comments?: { created: number; updated: number };
        warnings?: string[];
        error?: string;
      };
      if (funnelRes.ok) {
        funnel = {
          comments: funnelData.comments,
          warnings: funnelData.warnings,
        };
      }
    }

    if (syncAllMetrics) {
      const origin = new URL(req.url).origin;
      const metricsRes = await fetch(`${origin}/api/instagram/metrics/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionDbId }),
      });
      const metricsData = (await metricsRes.json()) as {
        updated?: number;
        created?: number;
        error?: string;
      };
      if (metricsRes.ok) {
        metrics = {
          updated: metricsData.updated ?? 0,
          created: metricsData.created ?? 0,
        };
      }
    }

    return NextResponse.json({
      exported,
      created,
      updated,
      funnel,
      metrics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Instagram export failed";
    const status = message.includes("must be configured") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
