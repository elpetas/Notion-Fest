/**
 * Guided festival planner chat — streams from /api/chat and can scaffold Notion from tool output.
 */

"use client";

import { useChat } from "@ai-sdk/react";
import { SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

function ThinkingDots() {
  const delaysMs = [0, 160, 320];
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 pl-1">
      <span className="sr-only">Assistant is thinking</span>
      {delaysMs.map((delay) => (
        <span
          key={delay}
          className="bg-muted-foreground inline-block size-1.5 rounded-full"
          style={{
            animation: "notion-thinking-dot 1.4s ease-in-out infinite",
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8 md:py-10">
      <header className="space-y-2">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
          Festival planner
        </h1>
        <p className="text-muted-foreground max-w-xl text-sm leading-relaxed md:text-base">
          Work through budget, genre, dates, and vibe — then send a structured
          hub to Notion when the agent confirms your details.
        </p>
      </header>

      <section
        aria-labelledby="chat-heading"
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <h2 id="chat-heading" className="sr-only">
          Planning chat
        </h2>
        <div className="border-border bg-background flex min-h-[22rem] flex-1 flex-col overflow-hidden rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] md:min-h-[26rem]">
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 p-4 md:p-5">
              {messages.length === 0 ? (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Describe the festival you have in mind — mood, rough dates,
                  genre, and any budget hints. The agent will clarify before
                  locking settings.
                </p>
              ) : null}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex w-full",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[min(100%,28rem)] px-3.5 py-2.5 text-sm leading-relaxed",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-sm"
                        : "border-border bg-card text-card-foreground rounded-2xl rounded-bl-md border shadow-sm",
                    )}
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
                            className={cn(
                              "mt-2 border-t pt-2 text-xs",
                              message.role === "user"
                                ? "border-primary-foreground/25 opacity-95"
                                : "border-border opacity-90",
                            )}
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
                <div className="flex justify-start">
                  <ThinkingDots />
                </div>
              ) : null}
            </div>
          </ScrollArea>
          <div className="border-border bg-background border-t p-3 md:p-4">
            {error ? (
              <p className="text-destructive mb-3 text-sm">{error.message}</p>
            ) : null}
            <form
              className="flex gap-2"
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
                className="border-border bg-card focus-visible:ring-primary/25 h-10 flex-1 rounded-xl border px-4 shadow-none md:h-11"
              />
              <Button
                type="submit"
                size="icon-lg"
                disabled={isBusy || !input.trim()}
                className="rounded-xl shrink-0"
                aria-label="Send message"
              >
                <SendHorizontal className="size-5" aria-hidden />
              </Button>
            </form>
          </div>
        </div>
      </section>

      {confirmed ? (
        <section
          aria-labelledby="notion-ready-heading"
          className="border-border bg-card text-card-foreground rounded-xl border p-6 shadow-[0_1px_2px_rgba(15,15,15,0.04)]"
        >
          <h2
            id="notion-ready-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Ready for Notion
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Summary from the agent — send this to create databases under your
            connected page.
          </p>
          <dl className="border-border mt-5 grid gap-3 border-t pt-5 text-sm md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Budget
              </dt>
              <dd className="font-medium">{confirmed.budget}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Genre
              </dt>
              <dd className="font-medium">{confirmed.genre}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Dates
              </dt>
              <dd className="font-medium">{confirmed.dateRange}</dd>
            </div>
            <div className="space-y-1 md:col-span-2">
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Vibe
              </dt>
              <dd className="font-medium">{confirmed.vibe}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              onClick={() => void handleSendToNotion()}
              disabled={notionState.kind === "loading"}
              className="rounded-xl px-5"
            >
              {notionState.kind === "loading"
                ? "Creating in Notion…"
                : "Send to Notion"}
            </Button>
            {notionState.kind === "ok" ? (
              <a
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "rounded-xl border-border",
                )}
                href={notionState.data.hubPageUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open hub in Notion
              </a>
            ) : null}
          </div>
          {notionState.kind === "error" ? (
            <p className="text-destructive mt-4 text-sm">{notionState.message}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-border bg-background flex items-center justify-between gap-4 border-b px-6 py-3">
        <span className="text-foreground text-sm font-semibold tracking-tight">
          Notion Fest
        </span>
        <Link
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "text-muted-foreground hover:text-foreground rounded-lg",
          )}
          href="/"
        >
          Home
        </Link>
      </header>
      <FestivalChatPageContent />
    </div>
  );
}
