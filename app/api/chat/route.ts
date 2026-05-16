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

import { FESTIVAL_SYSTEM_PROMPT, festivalTools } from "@/lib/ai/festival-agent";

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: { messages?: UIMessage[] };
  try {
    body = (await req.json()) as { messages?: UIMessage[] };
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { messages } = body;
  if (!messages?.length) {
    return NextResponse.json(
      { error: "messages array is required" },
      { status: 400 },
    );
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: FESTIVAL_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: festivalTools,
    stopWhen: stepCountIs(12),
  });

  return result.toUIMessageStreamResponse();
}
