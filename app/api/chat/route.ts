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

import { buildSystemPrompt, festivalTools } from "@/lib/ai/festival-agent";

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: { messages?: UIMessage[]; hubTitle?: string; parentPageUrl?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { messages, hubTitle } = body;
  if (!messages?.length) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 },
    );
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    // inject event name so the agent skips asking for it
    system: buildSystemPrompt(hubTitle),
    messages: await convertToModelMessages(messages),
    tools: festivalTools,
    stopWhen: stepCountIs(12),
  });

  return result.toUIMessageStreamResponse();
}
