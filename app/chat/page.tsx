/**
 * Chat page — sidebar + assistant-ui Thread layout.
 * Sidebar is collapsible and holds events list + Notion action.
 * Thread fills the main content area; welcome state is centered.
 */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
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
import { PanelLeft, ArrowLeft } from "lucide-react";
import { readWorkspacePrefs } from "@/lib/workspace-storage";
import type { FestivalSettings, NotionSetupResponse } from "@/types/festival";

// ---------------------------------------------------------------------------
// Context — lets the tool UI pass confirmed settings up to the sidebar
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
// Tool UI — renders inline inside the Thread for confirmFestivalSettings calls
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
// Collapsible sidebar
// ---------------------------------------------------------------------------

// placeholder past events — gives the sidebar its list feel from the wireframe
const PAST_EVENTS = ["Summer Fest '25", "Winter Warmup", "Block Party"];

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  confirmed: FestivalSettings | null;
}

function Sidebar({ open, onToggle, confirmed }: SidebarProps) {
  const [hubTitle, setHubTitle] = useState("New event");
  const [notionState, setNotionState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; data: NotionSetupResponse }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    const prefs = readWorkspacePrefs();
    if (prefs.hubTitle.trim()) setHubTitle(prefs.hubTitle.trim());
  }, []);

  async function handleSendToNotion() {
    if (!confirmed) return;
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
        const msg = typeof (data as { error?: string }).error === "string"
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
    <aside
      className={cn(
        "relative flex flex-shrink-0 flex-col border-r border-white/20 transition-[width] duration-300 overflow-hidden",
        open ? "w-52" : "w-12",
      )}
    >
      {/* top row */}
      <div className="flex h-12 items-center gap-2 px-3">
        {open && (
          <span className="flex-1 text-xs font-semibold uppercase tracking-widest text-white/50">
            Events
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      {/* divider */}
      <div className="mx-3 border-t border-white/15" />

      {/* events list */}
      {open && (
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          {/* active event */}
          <div className="rounded-lg bg-white/20 px-3 py-2 text-sm font-medium text-white truncate">
            {hubTitle}
          </div>

          {/* past events (placeholder) */}
          <div className="mx-1 my-1 border-t border-white/15" />
          {PAST_EVENTS.map((name) => (
            <button
              key={name}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/45 hover:bg-white/10 hover:text-white/80 transition-colors truncate"
            >
              {name}
            </button>
          ))}

          {/* notion ready section — appears once settings are confirmed */}
          {confirmed ? (
            <div className="mt-auto pt-3">
              <div className="mx-1 border-t border-white/15 pb-3" />
              <p className="px-1 text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">
                Ready for Notion
              </p>
              <dl className="space-y-1.5 px-1 text-xs text-white/80">
                <div>
                  <dt className="text-white/45">Genre</dt>
                  <dd className="font-medium truncate">{confirmed.genre}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Budget</dt>
                  <dd className="font-medium truncate">{confirmed.budget}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Dates</dt>
                  <dd className="font-medium truncate">{confirmed.dateRange}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-col gap-1.5">
                <Button
                  size="sm"
                  onClick={() => void handleSendToNotion()}
                  disabled={notionState.kind === "loading"}
                  className="w-full rounded-lg text-xs px-3"
                >
                  {notionState.kind === "loading" ? "Creating…" : "Send to Notion"}
                </Button>
                {notionState.kind === "ok" ? (
                  <a
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full rounded-lg border-white/25 bg-white/10 text-white hover:bg-white/20 text-xs px-3 h-8",
                    )}
                    href={notionState.data.hubPageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Notion ↗
                  </a>
                ) : null}
                {notionState.kind === "error" ? (
                  <p className="text-red-200 text-xs px-1">{notionState.message}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* bottom: home link */}
      {open && (
        <div className="border-t border-white/15 px-3 py-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-white/45 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Home
          </Link>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [confirmed, setConfirmed] = useState<FestivalSettings | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <ConfirmedCtx.Provider value={{ confirmed, onConfirmed: setConfirmed }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex h-[calc(100vh-3rem)] overflow-hidden bg-[#C38F6C]">
          {/* collapsible sidebar */}
          <Sidebar
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            confirmed={confirmed}
          />

          {/* main chat area — Thread fills all available height */}
          <main className="flex min-w-0 flex-1 flex-col">
            {/* register tool UI — side-effect only, renders nothing */}
            <FestivalSettingsToolUI />
            <Thread />
          </main>
        </div>
      </AssistantRuntimeProvider>
    </ConfirmedCtx.Provider>
  );
}
