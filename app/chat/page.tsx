/**
 * Chat page — assistant-ui Thread with workspace context pre-loaded from localStorage.
 * hubTitle (event name) is passed to every API request so the agent already knows
 * what event is being planned and won't ask for redundant info.
 */

"use client";

import { createContext, useContext, useState } from "react";
import {
  AssistantRuntimeProvider,
  useAssistantToolUI,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { readWorkspacePrefs } from "@/lib/workspace-storage";
import type { FestivalSettings, NotionSetupResponse } from "@/types/festival";

// ---------------------------------------------------------------------------
// Context — lets the tool UI pass confirmed settings up to the page
// ---------------------------------------------------------------------------

interface ConfirmedCtxValue {
  confirmed: FestivalSettings | null;
  onConfirmed: (s: FestivalSettings) => void;
}

const ConfirmedCtx = createContext<ConfirmedCtxValue>({
  confirmed: null,
  onConfirmed: () => {},
});

// ---------------------------------------------------------------------------
// Tool UI — renders inline in the Thread for confirmFestivalSettings calls
// ---------------------------------------------------------------------------

function FestivalSettingsToolUI() {
  const { onConfirmed } = useContext(ConfirmedCtx);

  useAssistantToolUI({
    toolName: "confirmFestivalSettings",
    render(toolPart) {
      const result = toolPart.result as FestivalSettings | undefined;
      const isDone = toolPart.status.type === "complete";

      if (isDone && result) {
        onConfirmed(result);
      }

      return (
        <div className="mt-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm text-white/90 backdrop-blur-sm">
          {isDone ? (
            <>
              <p className="font-medium">Festival settings locked in ✓</p>
              {result ? (
                <ul className="mt-1.5 space-y-0.5 text-white/75 text-xs">
                  <li>Genre: {result.genre}</li>
                  <li>Budget: {result.budget}</li>
                  <li>Dates: {result.dateRange}</li>
                  <li>Vibe: {result.vibe}</li>
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-white/70">Confirming festival settings…</p>
          )}
        </div>
      );
    },
  });

  return null;
}

// ---------------------------------------------------------------------------
// "Ready for Notion" card — shown once settings are confirmed
// ---------------------------------------------------------------------------

function NotionReadyCard({ confirmed }: { confirmed: FestivalSettings }) {
  const [notionState, setNotionState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; data: NotionSetupResponse }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSendToNotion() {
    setNotionState({ kind: "loading" });
    try {
      const prefs = readWorkspacePrefs();
      const body = {
        ...confirmed,
        ...(prefs.parentPageUrl.trim() ? { parentPageUrl: prefs.parentPageUrl.trim() } : {}),
        ...(prefs.hubTitle.trim() ? { hubTitle: prefs.hubTitle.trim() } : {}),
      };
      const res = await fetch("/api/notion/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      setNotionState({ kind: "ok", data: data as NotionSetupResponse });
    } catch (err) {
      setNotionState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <section
      aria-labelledby="notion-ready-heading"
      className="mx-auto w-full max-w-2xl rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md p-5 text-white shadow-md"
    >
      <h2 id="notion-ready-heading" className="text-base font-semibold tracking-tight">
        Ready for Notion
      </h2>
      <p className="mt-0.5 text-sm text-white/70">
        Send this to Notion to scaffold your event workspace.
      </p>

      <dl className="mt-4 grid gap-2.5 border-t border-white/20 pt-4 text-sm md:grid-cols-2">
        {(
          [
            ["Budget", confirmed.budget],
            ["Genre", confirmed.genre],
            ["Dates", confirmed.dateRange],
            ["Vibe", confirmed.vibe],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="space-y-0.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <Button
          onClick={() => void handleSendToNotion()}
          disabled={notionState.kind === "loading"}
          className="rounded-xl px-5"
        >
          {notionState.kind === "loading" ? "Creating…" : "Send to Notion"}
        </Button>
        {notionState.kind === "ok" ? (
          <a
            className={cn(
              buttonVariants({ variant: "outline" }),
              "rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20",
            )}
            href={notionState.data.hubPageUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in Notion ↗
          </a>
        ) : null}
        {notionState.kind === "error" ? (
          <p className="text-red-200 text-sm">{notionState.message}</p>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inner content — inside AssistantRuntimeProvider to use tool UI hooks
// ---------------------------------------------------------------------------

function ChatContent({ confirmed }: { confirmed: FestivalSettings | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* registers the tool UI — no visual output */}
      <FestivalSettingsToolUI />
      <Thread />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [confirmed, setConfirmed] = useState<FestivalSettings | null>(null);

  // read prefs synchronously (localStorage) — safe in "use client" components
  const prefs = readWorkspacePrefs();

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      // pass event context with every request so the agent has it from message 1
      body: {
        ...(prefs.hubTitle.trim() ? { hubTitle: prefs.hubTitle.trim() } : {}),
        ...(prefs.parentPageUrl.trim() ? { parentPageUrl: prefs.parentPageUrl.trim() } : {}),
      },
    }),
  });

  return (
    <ConfirmedCtx.Provider value={{ confirmed, onConfirmed: setConfirmed }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex h-screen flex-col overflow-hidden bg-[#C38F6C]">
          {/* minimal top bar — just a home link */}
          <div className="flex shrink-0 items-center px-5 pt-4 pb-1">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              <ArrowLeft className="size-3" />
              Home
            </Link>
            {prefs.hubTitle && (
              <span className="ml-auto text-sm font-semibold text-white/80">
                {prefs.hubTitle}
              </span>
            )}
          </div>

          {/* thread fills all remaining height */}
          <ChatContent confirmed={confirmed} />

          {/* notion ready card appears below thread once settings confirmed */}
          {confirmed ? (
            <div className="shrink-0 px-4 pb-5">
              <NotionReadyCard confirmed={confirmed} />
            </div>
          ) : null}
        </div>
      </AssistantRuntimeProvider>
    </ConfirmedCtx.Provider>
  );
}
