/**
 * Generates social/ad draft copy with Claude based on festival context and sales tone.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

import type { DraftChannel, FestivalDraftContext, GeneratedDraft } from "@/lib/content/types";

const draftSchema = z.object({
  headline: z.string().describe("Short title for the post or ad row in Notion"),
  caption: z
    .string()
    .describe("Main social caption — include emojis sparingly, platform-appropriate length"),
  hashtags: z.array(z.string()).max(12).describe("Hashtags without # prefix"),
  adCopyBody: z.string().describe("Longer body for Ad copies DB or email variant"),
  imagePrompt: z
    .string()
    .describe(
      "Detailed DALL·E prompt: festival poster aesthetic, colors, typography style, no real artist faces",
    ),
  suggestedGoLive: z
    .string()
    .nullable()
    .describe("ISO date YYYY-MM-DD for ideal publish date, or null"),
});

function formatContext(ctx: FestivalDraftContext, channel: DraftChannel): string {
  const tierLines = ctx.tiers
    .filter((t) => !t.hidden)
    .slice(0, 6)
    .map((t) => {
      const price = t.free ? "Free" : `$${t.cost?.major_value ?? "?"}`;
      const sold = t.quantity_sold ?? 0;
      const cap = t.quantity_total ?? 0;
      const status = t.on_sale_status ?? "unknown";
      const salesEnd = t.sales_end ? new Date(t.sales_end).toLocaleDateString() : "n/a";
      return `- ${t.name}: ${price}, ${sold}/${cap} sold, status ${status}, sales end ${salesEnd}`;
    })
    .join("\n");

  const artistLines =
    ctx.artists.length > 0
      ? ctx.artists.map((a) => `- ${a.name}${a.notes ? ` (${a.notes.slice(0, 120)})` : ""}`).join("\n")
      : "- (no roster synced yet — infer vibe from event description)";

  return [
    `Channel: ${channel}`,
    `Event: ${ctx.event.name}`,
    `Status: ${ctx.event.status}`,
    `Venue: ${ctx.event.venueName || "TBA"} — ${ctx.event.venueAddress || ""}`,
    `Event dates: ${ctx.event.startUtc} → ${ctx.event.endUtc}`,
    `Event URL: ${ctx.event.url}`,
    `Sold out flag: ${ctx.event.isSoldOut}`,
    ctx.genre ? `Genre focus: ${ctx.genre}` : null,
    ctx.vibe ? `Vibe / positioning: ${ctx.vibe}` : null,
    "",
    "Ticket tiers:",
    tierLines || "- none",
    "",
    "DJ / Artist roster (from Spotify sync):",
    artistLines,
    "",
    `Marketing tone: ${ctx.toneLabel} (${ctx.tone})`,
    `Tone guidance: ${ctx.toneGuidance}`,
    ctx.daysUntilEvent != null ? `Days until event: ${ctx.daysUntilEvent}` : null,
    ctx.daysUntilSalesEnd != null ? `Days until sales end: ${ctx.daysUntilSalesEnd}` : null,
    ctx.sellThroughPct != null ? `Sell-through: ${ctx.sellThroughPct}%` : null,
    "",
    "Event description excerpt:",
    ctx.event.description.slice(0, 800) || "(none)",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateDraftCopy(
  ctx: FestivalDraftContext,
  channel: DraftChannel,
): Promise<GeneratedDraft> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    schema: draftSchema,
    system: `You are a festival social media strategist. Write on-brand draft content that matches the sales-phase tone exactly.
Rules:
- Never invent specific artist names unless they appear in the roster context.
- Instagram captions: under 2200 chars; TikTok: punchy and under 500 chars; Email: subject-friendly headline + body.
- Hashtags: relevant, mix of niche and broad, no spam.
- imagePrompt: cinematic festival poster, abstract or silhouette crowd — no copyrighted logos, no photorealistic celebrity faces.
- Align urgency and CTA with the tone (e.g. sold_out = waitlist/FOMO, urgency = deadline).`,
    prompt: `Create draft ${channel} content for this festival:\n\n${formatContext(ctx, channel)}`,
  });

  return {
    ...object,
    tone: ctx.tone,
    toneLabel: ctx.toneLabel,
  };
}
