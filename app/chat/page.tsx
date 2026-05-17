/**
 * Chat page — assistant-ui Thread backed by the /api/chat streaming route.
 * Onboarding: Eventbrite → Instagram → Artist roster → Notion.
 */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AssistantRuntimeProvider, useAui, useAssistantToolUI } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { OnboardingToolUIs } from "@/components/chat/onboarding-tool-uis";
import { Thread } from "@/components/assistant-ui/thread";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  clearPendingOnboarding,
  hasPendingOnboarding,
  readPendingOnboarding,
} from "@/lib/onboarding-pending-storage";
import type { PendingOnboardingData } from "@/types/onboarding-pending";
import { readWorkspacePrefs } from "@/lib/workspace-storage";
import { chellaType } from "@/lib/fonts/chella-type";
import type { FlushPendingResult } from "@/lib/onboarding/flush-pending-server";
import type {
  ChatOnboardingState,
  EventbriteEventInfo,
  FestivalSettings,
  NotionSetupResponse,
} from "@/types/festival";

const KICKOFF_KEY = "notionFestChatKickoff";

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
// Tool UI components
// ---------------------------------------------------------------------------

function ConfirmSettingsToolPart({
  toolPart,
}: {
  toolPart: { result?: unknown; status: { type: string } };
}) {
  const { onConfirmed } = useContext(ConfirmedCtx);
  const result = toolPart.result as FestivalSettings | undefined;
  const isDone = toolPart.status.type === "complete";
  const lastReported = useRef<string | null>(null);

  useEffect(() => {
    if (!isDone || !result) return;
    const key = JSON.stringify(result);
    if (lastReported.current === key) return;
    lastReported.current = key;
    onConfirmed(result);
  }, [isDone, result, onConfirmed]);

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
}

function FestivalSettingsToolUI() {
  useAssistantToolUI({
    toolName: "confirmFestivalSettings",
    render(toolPart) {
      return <ConfirmSettingsToolPart toolPart={toolPart} />;
    },
  });

  return null;
}

// ---------------------------------------------------------------------------
// Chat kickoff — fires a seeding message once per session
// ---------------------------------------------------------------------------

function ChatKickoff() {
  const aui = useAui();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KICKOFF_KEY)) return;
      sessionStorage.setItem(KICKOFF_KEY, "1");
    } catch {
      return;
    }
    void aui.thread().append({
      role: "user",
      content: [
        {
          type: "text",
          text: "Help me set up my festival hub — start with Eventbrite.",
        },
      ],
    });
  }, [aui]);

  return null;
}

// ---------------------------------------------------------------------------
// Hub export bar — deploy worker + push onboarding data to Notion
// ---------------------------------------------------------------------------

interface HubExportBarProps {
  confirmed: FestivalSettings;
  onboarding: ChatOnboardingState;
  workspace: NotionSetupResponse | null;
  onHubCreated: (workspace: NotionSetupResponse) => void;
}

function HubExportBar({
  confirmed,
  onboarding,
  workspace,
  onHubCreated,
}: HubExportBarProps) {
  const aui = useAui();
  const [notionState, setNotionState] = useState<
    | { kind: "idle" }
    | { kind: "loading"; phase: "hub" | "worker" }
    | { kind: "ok"; data: NotionSetupResponse; syncNote?: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  if (workspace?.hubPageUrl) {
    return (
      <section className="rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md p-5 text-white shadow-md">
        <h2 className="text-base font-semibold tracking-tight">Your festival hub</h2>
        <p className="mt-0.5 text-sm text-white/70">
          Onboarding data is synced into your connected Notion workspace.
        </p>
        <a
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mt-4 inline-flex rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20",
          )}
          href={workspace.hubPageUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open hub in Notion ↗
        </a>
      </section>
    );
  }

  async function handleDeployWorker() {
    if (!confirmed) return;
    setNotionState({ kind: "loading", phase: "hub" });
    try {
      const prefs = readWorkspacePrefs();
      const pending = readPendingOnboarding();
      const ebUrl =
        onboarding.eventbriteUrl ??
        pending?.eventbriteUrl ??
        onboarding.eventbrite?.url ??
        onboarding.eventbrite?.id;

      const body = {
        ...confirmed,
        budget: confirmed.budget.trim(),
        genre: confirmed.genre.trim(),
        dateRange: confirmed.dateRange.trim() || "TBD",
        vibe: confirmed.vibe.trim() || confirmed.genre.trim(),
        ...(prefs.parentPageUrl.trim()
          ? { parentPageUrl: prefs.parentPageUrl.trim() }
          : {}),
        ...(prefs.hubTitle.trim() ? { hubTitle: prefs.hubTitle.trim() } : {}),
        pending: pending as PendingOnboardingData | null,
        ...(ebUrl ? { eventbriteUrl: ebUrl } : {}),
      };

      setNotionState({ kind: "loading", phase: "worker" });

      const res = await fetch("/api/chat/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        workspace?: NotionSetupResponse;
        summaryMessage?: string;
        flush?: FlushPendingResult;
        workerDeployed?: boolean;
        workerDeployError?: string;
        error?: string;
      };

      if (!res.ok || !data.workspace) {
        setNotionState({
          kind: "error",
          message: data.error ?? "Deploy failed",
        });
        return;
      }

      const ws = data.workspace;
      try {
        localStorage.setItem("notionFestWorkspace", JSON.stringify(ws));
      } catch {
        // localStorage unavailable
      }
      clearPendingOnboarding();
      onHubCreated(ws);

      if (data.summaryMessage) {
        await aui.thread().append({
          role: "assistant",
          content: [{ type: "text", text: data.summaryMessage }],
        });
      }

      const parts: string[] = [];
      const flushed = data.flush;
      if (flushed?.eventbrite) parts.push("Eventbrite synced");
      if (flushed?.instagram) parts.push(`${flushed.instagram} Instagram post(s)`);
      if (flushed?.artists) parts.push(`${flushed.artists} artist(s)`);
      let syncNote =
        parts.length > 0 ? `Synced to your hub: ${parts.join(", ")}.` : undefined;
      if (data.workerDeployed) {
        syncNote = [syncNote, "Notion Worker deployed via ntn."].filter(Boolean).join(" ");
      } else if (data.workerDeployError) {
        syncNote = [syncNote, data.workerDeployError].filter(Boolean).join(" ");
      }
      if (flushed?.errors?.length) {
        syncNote = [syncNote, flushed.errors.join(" ")].filter(Boolean).join(" ");
      }

      setNotionState({ kind: "ok", data: ws, syncNote });
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
        Deploy your worker
      </h2>
      <p className="mt-0.5 text-sm text-white/70">
        Creates your festival hub, syncs onboarding data, deploys the Notion Worker with{" "}
        <code className="text-xs">ntn workers deploy</code> in Vercel Sandbox, and posts a summary in chat.
      </p>
      <ul className="mt-3 space-y-0.5 border-t border-white/20 pt-3 text-xs text-white/75">
        <li>Budget: {confirmed.budget}</li>
        <li>Genre: {confirmed.genre}</li>
        <li>Dates: {confirmed.dateRange}</li>
        <li>Vibe: {confirmed.vibe}</li>
      </ul>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          onClick={() => void handleDeployWorker()}
          disabled={notionState.kind === "loading"}
          className="rounded-xl px-5"
        >
          {notionState.kind === "loading"
            ? notionState.phase === "worker"
              ? "Deploying worker (ntn)…"
              : "Creating hub…"
            : "Deploy Worker"}
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
      {notionState.kind === "ok" && notionState.syncNote ? (
        <p className="mt-3 text-sm text-emerald-200/90">{notionState.syncNote}</p>
      ) : null}
      {notionState.kind === "error" ? (
        <p className="mt-3 text-sm text-red-200">{notionState.message}</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inner content — inside AssistantRuntimeProvider to use tool UI hooks
// ---------------------------------------------------------------------------

function ChatContent({
  confirmed,
  workspace,
  onboarding,
  onEventbriteImported,
  onInstagramExported,
  onArtistsExported,
  onConfirmed,
  onHubCreated,
}: {
  confirmed: FestivalSettings | null;
  workspace: NotionSetupResponse | null;
  onboarding: ChatOnboardingState;
  onEventbriteImported: (event: EventbriteEventInfo, eventUrl?: string) => void;
  onInstagramExported: () => void;
  onArtistsExported: () => void;
  onConfirmed: (settings: FestivalSettings) => void;
  onHubCreated: (workspace: NotionSetupResponse) => void;
}) {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden px-4 py-4 md:px-6 md:py-5">
      <ChatKickoff />
      <FestivalSettingsToolUI />
      <OnboardingToolUIs
        workspace={workspace}
        eventbriteEvent={onboarding.eventbrite}
        onEventbriteImported={onEventbriteImported}
        onInstagramExported={onInstagramExported}
        onArtistsExported={onArtistsExported}
        onSettingsConfirmed={onConfirmed}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/25 bg-white/10 shadow-xl backdrop-blur-md [&_.aui-thread-root]:min-h-0">
        <Thread />
      </div>

      {onboarding.eventbrite && !confirmed ? (
        <p className="text-center text-xs text-white/60">
          Event linked: {onboarding.eventbrite.name}
          {onboarding.instagramExported
            ? workspace
              ? " · Instagram synced"
              : " · Instagram saved"
            : ""}
          {onboarding.artistsExported
            ? workspace
              ? " · Artists synced"
              : " · Artists saved"
            : ""}
          {!workspace && hasPendingOnboarding() ? " · Syncs when hub is created" : ""}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [confirmed, setConfirmed] = useState<FestivalSettings | null>(null);
  const [workspace, setWorkspace] = useState<NotionSetupResponse | null>(null);
  const [onboarding, setOnboarding] = useState<ChatOnboardingState>({});
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("notionFestWorkspace");
      if (saved) {
        setWorkspace(JSON.parse(saved) as NotionSetupResponse);
      }
      const pending = readPendingOnboarding();
      if (pending?.eventbrite) {
        setOnboarding((prev) => ({
          ...prev,
          eventbrite: pending.eventbrite,
          eventbriteUrl:
            pending.eventbriteUrl ?? pending.eventbrite?.url ?? pending.eventbrite?.id,
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  function handleHubCreated(ws: NotionSetupResponse) {
    setWorkspace(ws);
  }

  const transportRef = useRef(
    new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages, body }) => {
        let ws: NotionSetupResponse | undefined;
        try {
          const saved = localStorage.getItem("notionFestWorkspace");
          if (saved) ws = JSON.parse(saved) as NotionSetupResponse;
        } catch {
          // ignore
        }
        return {
          body: {
            ...body,
            messages,
            ...(ws?.hubPageId ? { workspace: ws } : {}),
            onboarding: onboardingRef.current,
          },
        };
      },
    }),
  );

  const runtime = useChatRuntime({
    transport: transportRef.current,
  });

  const showDeployBar = Boolean(confirmed) && !workspace?.hubPageUrl;

  return (
    <ConfirmedCtx.Provider value={{ confirmed, onConfirmed: setConfirmed }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex h-dvh flex-col overflow-hidden bg-[#C38F6C]">
          <header className="z-20 flex shrink-0 items-center justify-between border-b border-white/20 bg-[#C38F6C] px-5 py-3">
            <Link
              href="/"
              className={`${chellaType.className} text-xl leading-none text-white drop-shadow-sm transition-opacity hover:opacity-80`}
            >
              Notionchella
            </Link>
            <Link
              href="/sync"
              className="text-sm text-white/80 underline-offset-2 hover:text-white hover:underline"
            >
              Integrations
            </Link>
          </header>

          <ChatContent
            confirmed={confirmed}
            workspace={workspace}
            onboarding={onboarding}
            onEventbriteImported={(event, eventUrl) =>
              setOnboarding((prev) => ({
                ...prev,
                eventbrite: event,
                eventbriteUrl: eventUrl ?? prev.eventbriteUrl ?? event.url ?? event.id,
              }))
            }
            onInstagramExported={() =>
              setOnboarding((prev) => ({ ...prev, instagramExported: true }))
            }
            onArtistsExported={() =>
              setOnboarding((prev) => ({ ...prev, artistsExported: true }))
            }
            onConfirmed={setConfirmed}
            onHubCreated={handleHubCreated}
          />

          {showDeployBar && confirmed ? (
            <div className="shrink-0 border-t border-white/20 bg-white/10 px-4 py-4 backdrop-blur-md md:px-6">
              <div className="mx-auto w-full max-w-3xl">
                <HubExportBar
                  confirmed={confirmed}
                  onboarding={onboarding}
                  workspace={workspace}
                  onHubCreated={handleHubCreated}
                />
              </div>
            </div>
          ) : null}
        </div>
      </AssistantRuntimeProvider>
    </ConfirmedCtx.Provider>
  );
}
