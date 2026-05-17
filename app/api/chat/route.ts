/**
 * Streaming chat endpoint for the festival planning agent (Claude + tool calling).
 * Accepts optional hubTitle in the request body to pre-load event context into
 * the system prompt so the agent doesn't re-ask what the user already told us.
 */

import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";

<<<<<<< HEAD
import { buildSystemPrompt, festivalTools } from "@/lib/ai/festival-agent";
=======
import { createHubTools } from "@/lib/ai/hub-tools";
import { FESTIVAL_SYSTEM_PROMPT, festivalTools } from "@/lib/ai/festival-agent";
import {
  buildOnboardingSystemPrompt,
  createOnboardingTools,
} from "@/lib/ai/onboarding-tools";
import type { ChatOnboardingState, NotionSetupResponse } from "@/types/festival";
>>>>>>> d185e4fa291796d474e37747070634a97f2084d4

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

<<<<<<< HEAD
  let body: { messages?: UIMessage[]; hubTitle?: string; parentPageUrl?: string };
  try {
    body = (await req.json()) as typeof body;
=======
  let body: {
    messages?: UIMessage[];
    workspace?: NotionSetupResponse;
    onboarding?: ChatOnboardingState;
  };
  try {
    body = (await req.json()) as {
      messages?: UIMessage[];
      workspace?: NotionSetupResponse;
      onboarding?: ChatOnboardingState;
    };
>>>>>>> d185e4fa291796d474e37747070634a97f2084d4
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

<<<<<<< HEAD
  const { messages, hubTitle } = body;
=======
  const { messages, workspace, onboarding } = body;
>>>>>>> d185e4fa291796d474e37747070634a97f2084d4
  if (!messages?.length) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 },
    );
  }

  const hubTools =
    workspace?.hubPageId && workspace.databaseIds
      ? createHubTools({
          hubPageId: workspace.hubPageId,
          databaseIds: workspace.databaseIds,
        })
      : {};

  const onboardingTools = createOnboardingTools(workspace);

  let system = buildOnboardingSystemPrompt(FESTIVAL_SYSTEM_PROMPT, workspace);
  if (onboarding?.eventbrite) {
    system += `\n\nEventbrite already imported: "${onboarding.eventbrite.name}" (${onboarding.eventbrite.venueName || "venue TBD"}).`;
  }
  if (onboarding?.instagramExported) {
    system += "\nInstagram posts export step: completed.";
  }
  if (onboarding?.artistsExported) {
    system += "\nArtist roster export step: completed.";
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
<<<<<<< HEAD
    // inject event name so the agent skips asking for it
    system: buildSystemPrompt(hubTitle),
=======
    system,
>>>>>>> d185e4fa291796d474e37747070634a97f2084d4
    messages: await convertToModelMessages(messages),
    tools: { ...festivalTools, ...onboardingTools, ...hubTools },
    stopWhen: stepCountIs(16),
  });

  return result.toUIMessageStreamResponse();
}
