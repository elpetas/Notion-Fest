/**
 * Replies to an Instagram comment or DM tracked in the engagement funnel.
 * POST /api/instagram/funnel/reply
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getInstagramCredentials } from "@/lib/instagram/config";
import { replyToComment, sendDirectMessage } from "@/lib/instagram/graph";
import { getNotionClient } from "@/lib/notion/client";
import { richTextPlain, selectName } from "@/lib/notion/query";

const bodySchema = z.object({
  notionPageId: z.string().min(1),
  message: z.string().min(1).max(1000),
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

  const { notionPageId, message } = parsed.data;

  try {
    getInstagramCredentials();
    const notion = getNotionClient();
    const page = await notion.pages.retrieve({ page_id: notionPageId });

    if (!("properties" in page)) {
      return NextResponse.json({ error: "Invalid Notion page" }, { status: 400 });
    }

    const props = page.properties as Record<string, unknown>;
    const type = selectName(props, "Type");
    const igId = richTextPlain(props, "IG ID");
    const recipientId = richTextPlain(props, "Recipient ID");

    if (!type || !igId) {
      return NextResponse.json(
        { error: "Notion page is missing Type or IG ID — sync the funnel first." },
        { status: 400 },
      );
    }

    let outboundId: string;
    if (type === "Comment") {
      outboundId = await replyToComment(igId, message);
    } else if (type === "DM") {
      if (!recipientId) {
        return NextResponse.json(
          { error: "DM row is missing Recipient ID — re-sync the funnel." },
          { status: 400 },
        );
      }
      outboundId = await sendDirectMessage(recipientId, message);
    } else {
      return NextResponse.json({ error: `Unsupported funnel type: ${type}` }, { status: 400 });
    }

    await notion.pages.update({
      page_id: notionPageId,
      properties: {
        Status: { select: { name: "Replied" } },
      },
    });

    return NextResponse.json({ ok: true, outboundId });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "Reply failed";
    const status = messageText.includes("must be configured") ? 500 : 502;
    return NextResponse.json({ error: messageText }, { status });
  }
}
