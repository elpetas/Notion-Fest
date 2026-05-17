import { getNotionClient } from "@/lib/notion/client";

import { findPageByIgId } from "@/lib/notion/query";

export type FunnelType = "Comment" | "DM";
export type FunnelStatus = "New" | "In progress" | "Replied" | "Closed";

export interface FunnelItemInput {
  igId: string;
  type: FunnelType;
  subject: string;
  message: string;
  sender: string;
  receivedAt: string;
  mediaId?: string;
  conversationId?: string;
  recipientId?: string;
  permalink?: string;
  postCaption?: string;
}

function rt(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, 2000) } }];
}

export async function upsertFunnelItem(
  databaseId: string,
  item: FunnelItemInput,
): Promise<"created" | "updated"> {
  const notion = getNotionClient();
  const existingId = await findPageByIgId(databaseId, item.igId);

  const properties: Record<string, unknown> = {
    Subject: { title: rt(item.subject) },
    Type: { select: { name: item.type } },
    Message: { rich_text: rt(item.message) },
    Sender: { rich_text: rt(item.sender) },
    "IG ID": { rich_text: rt(item.igId) },
    Received: { date: { start: item.receivedAt } },
  };

  if (item.mediaId) {
    properties["Media ID"] = { rich_text: rt(item.mediaId) };
  }
  if (item.conversationId) {
    properties["Conversation ID"] = { rich_text: rt(item.conversationId) };
  }
  if (item.recipientId) {
    properties["Recipient ID"] = { rich_text: rt(item.recipientId) };
  }
  if (item.permalink) {
    properties.Permalink = { url: item.permalink };
  }
  if (item.postCaption) {
    properties["Post caption"] = { rich_text: rt(item.postCaption) };
  }

  if (existingId) {
    await notion.pages.update({
      page_id: existingId,
      properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
    });
    return "updated";
  }

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      ...properties,
      Status: { select: { name: "New" } },
    } as Parameters<typeof notion.pages.create>[0]["properties"],
  });
  return "created";
}
