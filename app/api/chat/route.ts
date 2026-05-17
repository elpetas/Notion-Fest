/**
 * Streaming chat endpoint for the festival planning agent (Claude + tool calling).
 */

import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";

import { createHubTools } from "@/lib/ai/hub-tools";
import { FESTIVAL_SYSTEM_PROMPT, festivalTools } from "@/lib/ai/festival-agent";
import {
  buildOnboardingSystemPrompt,
  createOnboardingTools,
} from "@/lib/ai/onboarding-tools";
import type { ChatOnboardingState, NotionSetupResponse } from "@/types/festival";

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

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
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { messages, workspace, onboarding } = body;
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
    system,
    messages: await convertToModelMessages(messages),
    tools: { ...festivalTools, ...onboardingTools, ...hubTools },
    stopWhen: stepCountIs(16),
  });

  return result.toUIMessageStreamResponse();
}
