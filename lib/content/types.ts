import type { ContentTone } from "@/lib/content/sales-tone";
import type { EbEventSummary, EbTicketClass } from "@/lib/eventbrite/client";

export type DraftChannel = "Instagram" | "TikTok" | "Email";

export interface RosterArtistContext {
  name: string;
  notes: string;
}

export interface FestivalDraftContext {
  event: EbEventSummary;
  tiers: EbTicketClass[];
  artists: RosterArtistContext[];
  tone: ContentTone;
  toneLabel: string;
  toneGuidance: string;
  daysUntilEvent: number | null;
  daysUntilSalesEnd: number | null;
  sellThroughPct: number | null;
  genre?: string;
  vibe?: string;
}

export interface GeneratedDraft {
  headline: string;
  caption: string;
  hashtags: string[];
  adCopyBody: string;
  imagePrompt: string;
  suggestedGoLive: string | null;
  tone: ContentTone;
  toneLabel: string;
}

export interface DraftGenerationResult extends GeneratedDraft {
  imageUrl: string | null;
  imageId: string | null;
  notion: {
    socialPageId: string | null;
    adCopyPageId: string | null;
    flyerPageId: string | null;
  };
}
