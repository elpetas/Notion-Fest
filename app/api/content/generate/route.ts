/**
 * Agentic draft content generator — Eventbrite + Spotify context, sales-tone copy, DALL·E image.
 * POST /api/content/generate
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { gatherFestivalDraftContext } from "@/lib/content/gather-context";
import { generateDraftCopy } from "@/lib/content/generate-draft";
import { generateFestivalImage } from "@/lib/content/generate-image";
import { writeDraftsToNotion } from "@/lib/content/write-notion";

const bodySchema = z.object({
  eventId: z.string().min(1),
  channel: z.enum(["Instagram", "TikTok", "Email"]).default("Instagram"),
  genre: z.string().optional(),
  vibe: z.string().optional(),
  rosterDbId: z.string().optional(),
  writeToNotion: z.boolean().default(true),
  generateImage: z.boolean().default(true),
  socialDbId: z.string().optional(),
  adCopiesDbId: z.string().optional(),
  flyerDbId: z.string().optional(),
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

  const input = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    const ctx = await gatherFestivalDraftContext({
      eventId: input.eventId,
      rosterDbId: input.rosterDbId,
      genre: input.genre,
      vibe: input.vibe,
    });

    const draft = await generateDraftCopy(ctx, input.channel);

    let imageUrl: string | null = null;
    let imageId: string | null = null;
    let imageWarning: string | undefined;

    if (input.generateImage) {
      const origin = new URL(req.url).origin;
      const imageResult = await generateFestivalImage(draft.imagePrompt, origin);
      imageUrl = imageResult.imageUrl;
      imageId = imageResult.imageId;
      imageWarning = imageResult.warning;
    }

    let notion = {
      socialPageId: null as string | null,
      adCopyPageId: null as string | null,
      flyerPageId: null as string | null,
    };

    if (input.writeToNotion) {
      notion = await writeDraftsToNotion({
        draft,
        channel: input.channel,
        imageUrl,
        socialDbId: input.socialDbId,
        adCopiesDbId: input.adCopiesDbId,
        flyerDbId: input.flyerDbId,
      });
    }

    return NextResponse.json({
      ok: true,
      tone: {
        id: ctx.tone,
        label: ctx.toneLabel,
        guidance: ctx.toneGuidance,
        daysUntilEvent: ctx.daysUntilEvent,
        daysUntilSalesEnd: ctx.daysUntilSalesEnd,
        sellThroughPct: ctx.sellThroughPct,
      },
      event: {
        name: ctx.event.name,
        url: ctx.event.url,
        startUtc: ctx.event.startUtc,
        isSoldOut: ctx.event.isSoldOut,
      },
      artistsUsed: ctx.artists.map((a) => a.name),
      draft,
      imageUrl,
      imageId,
      imageWarning,
      notion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
