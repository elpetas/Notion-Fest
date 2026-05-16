/**
 * System prompt and tool definitions for the festival planning chat agent.
 */

import { tool } from "ai";
import { z } from "zod";

import type { FestivalSettings } from "@/types/festival";

export const FESTIVAL_SYSTEM_PROMPT = `You are a friendly, practical music festival planning guide.

Goals:
- Help the organizer clarify their vision in natural conversation.
- You MUST eventually collect clear answers for: budget, genre, and event dates (plus overall vibe / positioning).
- Ask one or two focused questions at a time so it does not feel like an interrogation.
- If the user already gave one of the required fields, acknowledge it and move on—do not re-ask unless uncertain.
- When budget, genre, dateRange, and vibe are all agreed on, call the confirmFestivalSettings tool exactly once with those final values.
- After calling the tool, briefly congratulate them and remind them they can click "Send to Notion" in the app to scaffold their planning workspace.

Tone: warm, concise, confident, no corporate jargon.`;

const festivalSettingsSchema = z.object({
  budget: z.string().describe("Final confirmed total or range, e.g. $50k or $20–35k"),
  genre: z.string().describe("Primary genre or blend, e.g. indie electronic / house"),
  dateRange: z.string().describe("Confirmed dates or range, same timezone assumptions as the user"),
  vibe: z.string().describe("Short summary of aesthetic, crowd, scale, location hints"),
});

export const confirmFestivalSettingsTool = tool({
  description:
    "Call when budget, genre, dateRange, and vibe are fully confirmed with the user. Returns the same payload so the UI can send it to Notion.",
  inputSchema: festivalSettingsSchema,
  execute: async (input): Promise<FestivalSettings> => ({
    budget: input.budget,
    genre: input.genre,
    dateRange: input.dateRange,
    vibe: input.vibe,
  }),
});

export const festivalTools = {
  confirmFestivalSettings: confirmFestivalSettingsTool,
};
