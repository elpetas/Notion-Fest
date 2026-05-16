/**
 * Guided festival planner chat — streams from /api/chat and can scaffold Notion from tool output.
 */

"use client";

import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FestivalSettings, NotionSetupResponse } from "@/types/festival";
import type { UIMessage } from "ai";

function extractConfirmedSettings(
  messages: UIMessage[],
): FestivalSettings | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") {
      continue;
    }
    for (const part of message.parts) {
      if (part.type !== "tool-confirmFestivalSettings") {
        continue;
      }
      if (part.state === "output-available" && part.output) {
        return part.output as FestivalSettings;
      }
    }
  }
  return null;
}

export function FestivalChatPageContent() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat();

  const confirmed = useMemo(
    () => extractConfirmedSettings(messages),
    [messages],
  );

  const isBusy = status === "streaming" || status === "submitted";

  const [notionState, setNotionState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; data: NotionSetupResponse }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSendToNotion() {
    if (!confirmed) {
      return;
    }
    setNotionState({ kind: "loading" });
    try {
      const res = await fetch("/api/notion/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmed),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "Notion request failed";
        setNotionState({ kind: "error", message: msg });
        return;
      }
      setNotionState({
        kind: "ok",
        data: data as NotionSetupResponse,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error calling Notion";
      setNotionState({ kind: "error", message });
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Notion Fest planner
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Chat through budget, genre, dates, and vibe — then push a structured
          workspace into Notion.
        </p>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0 pb-3">
          <CardTitle className="text-base">Planning chat</CardTitle>
          <CardDescription>
            The agent will confirm your details before calling the Notion tool.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 px-6">
          <ScrollArea className="min-h-[320px] flex-1 rounded-md border border-border p-4">
            <div className="flex flex-col gap-4 pr-2">
              {messages.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Start by describing the festival you have in mind — mood,
                  rough dates, genre, and any budget hints.
                </p>
              ) : null}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-8 flex justify-end"
                      : "mr-8 flex justify-start"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "bg-primary text-primary-foreground max-w-[90%] rounded-lg px-3 py-2 text-sm"
                        : "bg-muted max-w-[90%] rounded-lg px-3 py-2 text-sm"
                    }
                  >
                    {message.parts.map((part, idx) => {
                      if (part.type === "text") {
                        return (
                          <p key={idx} className="whitespace-pre-wrap">
                            {part.text}
                          </p>
                        );
                      }
                      if (part.type === "tool-confirmFestivalSettings") {
                        const label =
                          part.state === "output-available"
                            ? "Festival settings locked in"
                            : part.state === "output-error"
                              ? "Could not lock settings"
                              : "Confirming festival settings…";
                        return (
                          <p
                            key={idx}
                            className="mt-2 border-t border-border/60 pt-2 text-xs opacity-90"
                          >
                            {label}
                          </p>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              ))}
              {isBusy ? (
                <p className="text-muted-foreground text-xs">Thinking…</p>
              ) : null}
            </div>
          </ScrollArea>
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : null}
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              const text = input.trim();
              if (!text || isBusy) {
                return;
              }
              void sendMessage({ text });
              setInput("");
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message the festival planner…"
              disabled={isBusy}
              className="flex-1"
            />
            <Button type="submit" disabled={isBusy || !input.trim()}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>

      {confirmed ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ready for Notion</CardTitle>
            <CardDescription>
              Summary from the agent — send this to create databases under your
              connected page.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Budget:</span>{" "}
              {confirmed.budget}
            </p>
            <p>
              <span className="text-muted-foreground">Genre:</span>{" "}
              {confirmed.genre}
            </p>
            <p>
              <span className="text-muted-foreground">Dates:</span>{" "}
              {confirmed.dateRange}
            </p>
            <p>
              <span className="text-muted-foreground">Vibe:</span>{" "}
              {confirmed.vibe}
            </p>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-between">
            <Button
              onClick={() => void handleSendToNotion()}
              disabled={notionState.kind === "loading"}
            >
              {notionState.kind === "loading"
                ? "Creating in Notion…"
                : "Send to Notion"}
            </Button>
            {notionState.kind === "ok" ? (
              <a
                className={cn(buttonVariants({ variant: "outline" }))}
                href={notionState.data.hubPageUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open hub in Notion
              </a>
            ) : null}
          </CardFooter>
          {notionState.kind === "error" ? (
            <CardContent className="pt-0">
              <p className="text-destructive text-sm">{notionState.message}</p>
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <span className="text-sm font-medium">Notion Fest</span>
        <Link
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          href="/"
        >
          Home
        </Link>
      </header>
      <FestivalChatPageContent />
    </div>
  );
}
