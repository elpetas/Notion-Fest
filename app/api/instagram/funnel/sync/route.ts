/**
 * Syncs Instagram comments and DMs into the Notion engagement funnel database.
 * POST /api/instagram/funnel/sync
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getInstagramCredentials } from "@/lib/instagram/config";
import {
  devModeCommentWarning,
  fetchConversationMessageIds,
  fetchConversations,
  fetchMediaComments,
  fetchMessage,
  fetchRecentMedia,
} from "@/lib/instagram/graph";
import { upsertFunnelItem } from "@/lib/notion/funnel";

const bodySchema = z.object({
  notionDbId: z.string().min(1),
  includeComments: z.boolean().optional().default(true),
  includeMessages: z.boolean().optional().default(true),
  mediaLimit: z.number().int().min(1).max(25).optional().default(10),
  conversationLimit: z.number().int().min(1).max(50).optional().default(20),
});

function senderLabel(from?: { id: string; username?: string }): string {
  if (from?.username) return `@${from.username}`;
  if (from?.id) return from.id;
  return "Unknown";
}

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

  const { notionDbId, includeComments, includeMessages, mediaLimit, conversationLimit } =
    parsed.data;

  try {
    const { userId } = getInstagramCredentials();
    let commentsCreated = 0;
    let commentsUpdated = 0;
    let messagesCreated = 0;
    let messagesUpdated = 0;
    let totalCommentsFetched = 0;
    const warnings: string[] = [];

    if (includeComments) {
      const media = await fetchRecentMedia(mediaLimit);
      for (const item of media) {
        let comments: Awaited<ReturnType<typeof fetchMediaComments>> = [];
        try {
          comments = await fetchMediaComments(item.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to load comments";
          if (!warnings.includes(msg)) warnings.push(msg);
          continue;
        }
        totalCommentsFetched += comments.length;
        for (const comment of comments) {
          const fromId = comment.from?.id;
          if (fromId && fromId === userId) continue;

          const sender = senderLabel(comment.from);
          const preview = comment.text.slice(0, 60) || "Comment";
          const result = await upsertFunnelItem(notionDbId, {
            igId: comment.id,
            type: "Comment",
            subject: `${sender}: ${preview}`,
            message: comment.text,
            sender,
            receivedAt: comment.timestamp,
            mediaId: item.id,
            permalink: item.permalink,
            postCaption: item.caption ?? "",
          });
          if (result === "created") commentsCreated += 1;
          else commentsUpdated += 1;
        }
      }

      const commentWarning = devModeCommentWarning(media, totalCommentsFetched);
      if (commentWarning) warnings.push(commentWarning);
    }

    if (includeMessages) {
      const conversations = (await fetchConversations()).slice(0, conversationLimit);

      for (const conversation of conversations) {
        const messageRefs = await fetchConversationMessageIds(conversation.id);
        const recentRefs = messageRefs.slice(0, 20);

        for (const ref of recentRefs) {
          let msg;
          try {
            msg = await fetchMessage(ref.id);
          } catch {
            continue;
          }

          const fromId = msg.from?.id;
          if (!fromId || fromId === userId) continue;

          const text = msg.message?.trim() ?? "";
          if (!text) continue;

          const sender = senderLabel(msg.from);
          const preview = text.slice(0, 60) || "Message";

          const result = await upsertFunnelItem(notionDbId, {
            igId: msg.id,
            type: "DM",
            subject: `${sender}: ${preview}`,
            message: text,
            sender,
            receivedAt: msg.created_time,
            conversationId: conversation.id,
            recipientId: fromId,
          });

          if (result === "created") messagesCreated += 1;
          else messagesUpdated += 1;
        }
      }
    }

    return NextResponse.json({
      comments: { created: commentsCreated, updated: commentsUpdated },
      messages: { created: messagesCreated, updated: messagesUpdated },
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Funnel sync failed";
    const status = message.includes("must be configured") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
