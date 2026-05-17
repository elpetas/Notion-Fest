/**
 * Persists generated drafts into Notion Social schedule, Ad copies, and Flyer designs.
 */

import { getNotionClient } from "@/lib/notion/client";
import type { DraftChannel, GeneratedDraft } from "@/lib/content/types";

function rt(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, 2000) } }];
}

export interface WriteDraftsInput {
  draft: GeneratedDraft;
  channel: DraftChannel;
  imageUrl: string | null;
  socialDbId?: string;
  adCopiesDbId?: string;
  flyerDbId?: string;
}

export interface WriteDraftsResult {
  socialPageId: string | null;
  adCopyPageId: string | null;
  flyerPageId: string | null;
}

export async function writeDraftsToNotion(
  input: WriteDraftsInput,
): Promise<WriteDraftsResult> {
  const notion = getNotionClient();
  const { draft, channel, imageUrl } = input;

  let socialPageId: string | null = null;
  let adCopyPageId: string | null = null;
  let flyerPageId: string | null = null;

  const notesParts = [
    `Tone: ${draft.toneLabel} (${draft.tone})`,
    draft.hashtags.length ? `Hashtags: ${draft.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : null,
    `Image prompt: ${draft.imagePrompt}`,
  ].filter(Boolean);

  if (input.socialDbId?.trim()) {
    const goLive = draft.suggestedGoLive
      ? { date: { start: draft.suggestedGoLive } }
      : undefined;

    const page = await notion.pages.create({
      parent: { database_id: input.socialDbId.trim() },
      properties: {
        Post: {
          title: [{ type: "text", text: { content: draft.headline.slice(0, 200) } }],
        },
        Platform: { select: { name: channel === "Email" ? "Other" : channel } },
        Published: { checkbox: false },
        ...(goLive ? { "Go-live": goLive } : {}),
        ...(imageUrl ? { "Image URL": { url: imageUrl } } : {}),
        Notes: { rich_text: rt([draft.caption, ...notesParts].join("\n\n")) },
      },
    });
    socialPageId = page.id;
  }

  if (input.adCopiesDbId?.trim()) {
    const page = await notion.pages.create({
      parent: { database_id: input.adCopiesDbId.trim() },
      properties: {
        Name: {
          title: [{ type: "text", text: { content: draft.headline.slice(0, 200) } }],
        },
        Body: { rich_text: rt(draft.adCopyBody) },
        Channel: {
          select: {
            name:
              channel === "Instagram"
                ? "Instagram"
                : channel === "TikTok"
                  ? "TikTok"
                  : channel === "Email"
                    ? "Email"
                    : "Other",
          },
        },
      },
    });
    adCopyPageId = page.id;
  }

  if (input.flyerDbId?.trim()) {
    const page = await notion.pages.create({
      parent: { database_id: input.flyerDbId.trim() },
      properties: {
        Name: {
          title: [{ type: "text", text: { content: `${draft.headline} — visual` } }],
        },
        Concept: {
          rich_text: rt(
            [draft.imagePrompt, imageUrl ? `Generated image: ${imageUrl}` : null]
              .filter(Boolean)
              .join("\n\n"),
          ),
        },
        Status: { select: { name: "Draft" } },
      },
    });
    flyerPageId = page.id;
  }

  return { socialPageId, adCopyPageId, flyerPageId };
}
