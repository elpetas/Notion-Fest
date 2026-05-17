/**
 * Chat page — assistant-ui Thread backed by the /api/chat streaming route.
 * Background is #C38F6C (warm terracotta) with glassmorphism containers.
 * Confirmed festival settings bubble up via context → "Ready for Notion" card.
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  AssistantRuntimeProvider,
  useAssistantToolUI,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import localFont from "next/font/local";
import { Thread } from "@/components/assistant-ui/thread";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { readWorkspacePrefs } from "@/lib/workspace-storage";
import type { FestivalSettings, NotionSetupResponse } from "@/types/festival";

const chellaType = localFont({
  src: "../fonts/ChellaType-Regular.ttf",
  display: "swap",
});

// ---------------------------------------------------------------------------
// Context — lets the ConfirmFestivalSettings tool UI pass settings up
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
// Tool UI — renders inline when the agent calls confirmFestivalSettings
// ---------------------------------------------------------------------------

function FestivalSettingsToolUI() {
  const { onConfirmed } = useContext(ConfirmedCtx);

  useAssistantToolUI({
    toolName: "confirmFestivalSettings",
    render(toolPart) {
      const result = toolPart.result as FestivalSettings | undefined;
      const isDone = toolPart.status.type === "complete";

      // bubble confirmed settings up to the page state
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

interface NotionCardProps {
  confirmed: FestivalSettings;
}

function NotionReadyCard({ confirmed }: NotionCardProps) {
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
        ...(prefs.parentPageUrl.trim()
          ? { parentPageUrl: prefs.parentPageUrl.trim() }
          : {}),
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
      className="rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md p-5 text-white shadow-md"
    >
      <h2
        id="notion-ready-heading"
        className="text-base font-semibold tracking-tight"
      >
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
            <dt className="text-xs font-medium uppercase tracking-wide text-white/50">
              {label}
            </dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
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
      </div>
      {notionState.kind === "error" ? (
        <p className="mt-3 text-sm text-red-200">{notionState.message}</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inner content — must be inside AssistantRuntimeProvider to use useAui hooks
// ---------------------------------------------------------------------------

function ChatContent({
  confirmed,
  children,
}: {
  confirmed: FestivalSettings | null;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      {/* register the festival settings tool UI (renders nothing, side-effect only) */}
      <FestivalSettingsToolUI />

      {/* glass thread container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/25 bg-white/10 shadow-xl backdrop-blur-md">
        <Thread />
      </div>

      {/* confirmed settings → ready for notion card */}
      {confirmed ? <NotionReadyCard confirmed={confirmed} /> : null}

      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [confirmed, setConfirmed] = useState<FestivalSettings | null>(null);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <ConfirmedCtx.Provider value={{ confirmed, onConfirmed: setConfirmed }}>
      <AssistantRuntimeProvider runtime={runtime}>
        {/* warm terracotta full-page background */}
        <div className="flex min-h-screen flex-col bg-[#C38F6C]">
          {/* header — glass strip */}
          <header className="sticky top-0 z-20 flex items-center border-b border-white/20 bg-white/10 px-5 py-3 backdrop-blur-md">
            <Link
              href="/"
              className={`${chellaType.className} text-xl leading-none text-white drop-shadow-sm hover:opacity-80 transition-opacity`}
            >
              Notionchella
            </Link>
          </header>

          <ChatContent confirmed={confirmed} />
        </div>
      </AssistantRuntimeProvider>
    </ConfirmedCtx.Provider>
  );
}
