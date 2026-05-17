"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NotionSetupResponse } from "@/types/festival";

// ─── Eventbrite types ──────────────────────────────────────────────────────────

interface SyncedTier {
  name: string;
  price: number;
  capacity: number;
  sold: number;
  remaining?: number;
  onSaleStatus?: string | null;
}

interface SyncedEventSummary {
  name: string;
  status: string;
  url: string;
  venueName: string;
  venueAddress: string;
  isSoldOut: boolean;
  startUtc: string;
  endUtc: string;
}

type EventbriteSyncState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ok";
      tiers: SyncedTier[];
      event?: SyncedEventSummary;
      attendees?: { created: number; updated: number; total: number };
      venue?: { created: boolean; updated: boolean };
    }
  | { kind: "error"; message: string };

// ─── Spotify types ─────────────────────────────────────────────────────────────

interface SpotifyArtist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string[];
  imageUrl: string | null;
  spotifyUrl: string;
}

type SpotifySearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; artists: SpotifyArtist[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

type SpotifySyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "ok"; count: number }
  | { kind: "error"; message: string };

// ─── Instagram types ───────────────────────────────────────────────────────────

interface PendingPost {
  id: string;
  caption: string;
  goLive: string | null;
  notes: string;
}

interface PostMetric {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string;
  permalink: string;
  likes: number;
  comments: number;
  views: number;
  reach: number;
  saved: number;
}

type InstagramLoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; posts: PendingPost[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

type MetricsLoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; posts: PostMetric[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

type MetricsSyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "ok"; updated: number; created: number }
  | { kind: "error"; message: string };

type FunnelSyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | {
      kind: "ok";
      comments: { created: number; updated: number };
      messages: { created: number; updated: number };
      warnings?: string[];
    }
  | { kind: "error"; message: string };

// ─── Content generation types ──────────────────────────────────────────────────

type ContentChannel = "Instagram" | "TikTok" | "Email";

interface GeneratedDraftPreview {
  headline: string;
  caption: string;
  hashtags: string[];
  adCopyBody: string;
  imagePrompt: string;
  toneLabel: string;
}

type ContentGenState =
  | { kind: "idle" }
  | { kind: "generating" }
  | {
      kind: "ok";
      tone: { label: string; sellThroughPct: number | null; daysUntilSalesEnd: number | null };
      draft: GeneratedDraftPreview;
      imageUrl: string | null;
      imageWarning?: string;
      notion: { socialPageId: string | null; adCopyPageId: string | null; flyerPageId: string | null };
    }
  | { kind: "error"; message: string };

// ─── Calendar planner types ────────────────────────────────────────────────────

interface CalendarPlanItemView {
  date: string;
  title: string;
  type: "social_post" | "logistics" | "marketing" | "ops";
  platform?: string;
  priority: string;
  description: string;
  logisticsCategory?: string;
}

type CalendarPlanState =
  | { kind: "idle" }
  | { kind: "planning" }
  | {
      kind: "ok";
      summary: string;
      eventDate: string | null;
      items: CalendarPlanItemView[];
      applied?: { socialCreated: number; logisticsCreated: number; skipped: number };
    }
  | { kind: "error"; message: string };

const CALENDAR_TYPE_STYLES: Record<string, string> = {
  social_post: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  logistics: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  marketing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  ops: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

type PostPublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "ok"; postId: string }
  | { kind: "error"; message: string };

// ─── Hub writes ────────────────────────────────────────────────────────────────

type HubWriteState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

// ─── Coming soon ───────────────────────────────────────────────────────────────

const COMING_SOON = [
  { id: "mailchimp", label: "Mailchimp", description: "Publish email campaigns from the Social schedule DB." },
  { id: "stripe", label: "Stripe", description: "Invoice sponsors and auto-update Budget tracker on payment." },
  { id: "slack", label: "Slack", description: "Post day-of Run of show updates to your ops channel." },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SyncPage() {
  const [workspace, setWorkspace] = useState<NotionSetupResponse | null>(null);
  const [manualDbId, setManualDbId] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [syncState, setSyncState] = useState<EventbriteSyncState>({ kind: "idle" });
  const [syncVenue, setSyncVenue] = useState(true);
  const [syncAttendees, setSyncAttendees] = useState(true);

  // Spotify state
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [searchState, setSearchState] = useState<SpotifySearchState>({ kind: "idle" });
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const [spotifySyncState, setSpotifySyncState] = useState<SpotifySyncState>({ kind: "idle" });
  const [manualRosterDbId, setManualRosterDbId] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentStudioRef = useRef<HTMLDivElement | null>(null);

  // Instagram state
  const [manualSocialDbId, setManualSocialDbId] = useState("");
  const [manualFunnelDbId, setManualFunnelDbId] = useState("");
  const [igLoadState, setIgLoadState] = useState<InstagramLoadState>({ kind: "idle" });
  const [postImageUrls, setPostImageUrls] = useState<Record<string, string>>({});
  const [postPublishStates, setPostPublishStates] = useState<Record<string, PostPublishState>>({});
  const [metricsState, setMetricsState] = useState<MetricsLoadState>({ kind: "idle" });
  const [metricsSyncState, setMetricsSyncState] = useState<MetricsSyncState>({ kind: "idle" });
  const [funnelSyncState, setFunnelSyncState] = useState<FunnelSyncState>({ kind: "idle" });

  // Content generation state
  const [contentChannel, setContentChannel] = useState<ContentChannel>("Instagram");
  const [contentGenre, setContentGenre] = useState("");
  const [contentVibe, setContentVibe] = useState("");
  const [contentGenState, setContentGenState] = useState<ContentGenState>({ kind: "idle" });

  // Calendar planner state
  const [calendarWriteToNotion, setCalendarWriteToNotion] = useState(true);
  const [calendarPlanState, setCalendarPlanState] = useState<CalendarPlanState>({ kind: "idle" });
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const [hubBriefing, setHubBriefing] = useState("");
  const [hubTodos, setHubTodos] = useState("");
  const [hubWriteState, setHubWriteState] = useState<HubWriteState>({ kind: "idle" });
  const [hubRegenBudget, setHubRegenBudget] = useState("");
  const [hubRegenGenre, setHubRegenGenre] = useState("");
  const [hubRegenDates, setHubRegenDates] = useState("");
  const [hubRegenVibe, setHubRegenVibe] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("notionFestWorkspace");
      if (saved) {
        setWorkspace(JSON.parse(saved) as NotionSetupResponse);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const notionDbId = workspace?.databaseIds?.["Ticket tiers"] ?? manualDbId.trim();
  const ticketTiersUrl = workspace?.databaseUrls?.["Ticket tiers"];
  const venueDbId = workspace?.databaseIds?.["Venues"];
  const venueUrl = workspace?.databaseUrls?.["Venues"];
  const attendeesDbId = workspace?.databaseIds?.["Attendee list"];
  const attendeesUrl = workspace?.databaseUrls?.["Attendee list"];
  const rosterDbId = workspace?.databaseIds?.["DJ / Artist roster"] ?? manualRosterDbId.trim();
  const rosterUrl = workspace?.databaseUrls?.["DJ / Artist roster"];
  const socialDbId = workspace?.databaseIds?.["Social schedule"] ?? manualSocialDbId.trim();
  const socialUrl = workspace?.databaseUrls?.["Social schedule"];
  const funnelDbId =
    workspace?.databaseIds?.["Instagram engagement funnel"] ?? manualFunnelDbId.trim();
  const funnelUrl = workspace?.databaseUrls?.["Instagram engagement funnel"];
  const adCopiesDbId = workspace?.databaseIds?.["Ad copies"];
  const adCopiesUrl = workspace?.databaseUrls?.["Ad copies"];
  const flyerDbId = workspace?.databaseIds?.["Flyer designs"];
  const flyerUrl = workspace?.databaseUrls?.["Flyer designs"];
  const logisticsDbId = workspace?.databaseIds?.["Merchandise & logistics checklist"];
  const logisticsUrl = workspace?.databaseUrls?.["Merchandise & logistics checklist"];
  const hubPageId = workspace?.hubPageId;

  const hasCalendarSources = Boolean(
    workspace && (notionDbId || venueDbId || socialDbId || rosterDbId),
  );

  async function postHubAction(
    action: "briefing" | "todo" | "chart" | "status" | "regenerate",
    payload?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!hubPageId) return false;
    setHubWriteState({ kind: "loading" });
    try {
      const res = await fetch("/api/notion/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          hubPageId,
          databaseIds: workspace?.databaseIds ?? {},
          payload,
        }),
      });
      const data = (await res.json()) as { error?: string; appended?: number; blocksAppended?: number };
      if (!res.ok) {
        setHubWriteState({
          kind: "error",
          message: data.error ?? "Hub write failed",
        });
        return false;
      }
      const detail =
        action === "regenerate"
          ? `Appended ${data.blocksAppended ?? 0} structure blocks`
          : `Wrote ${data.appended ?? 1} block(s) to Notion`;
      setHubWriteState({ kind: "ok", message: detail });
      return true;
    } catch (err) {
      setHubWriteState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
      return false;
    }
  }

  async function handleHubBriefing() {
    const text = hubBriefing.trim();
    if (!text) return;
    const ok = await postHubAction("briefing", { text });
    if (ok) setHubBriefing("");
  }

  async function handleHubTodos() {
    const items = hubTodos
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const ok = await postHubAction("todo", { items });
    if (ok) setHubTodos("");
  }

  function handleHubStatus() {
    void postHubAction("status");
  }

  function handleHubRegenerate() {
    void postHubAction("regenerate", {
      settings: {
        budget: hubRegenBudget.trim() || "TBD",
        genre: hubRegenGenre.trim() || "Festival",
        dateRange: hubRegenDates.trim() || "TBD",
        vibe: hubRegenVibe.trim() || "Community-driven live experience",
      },
    });
  }

  const isHubWriting = hubWriteState.kind === "loading";

  // ── Eventbrite ────────────────────────────────────────────────────────────────

  async function handleEventbriteSync() {
    if (!notionDbId || !eventUrl.trim()) return;
    setSyncState({ kind: "loading" });
    try {
      const res = await fetch("/api/eventbrite/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: eventUrl.trim(),
          notionDbId,
          ...(syncVenue && venueDbId ? { venueDbId } : {}),
          ...(syncAttendees && attendeesDbId ? { attendeesDbId } : {}),
        }),
      });
      const data = (await res.json()) as {
        tiers?: SyncedTier[];
        event?: SyncedEventSummary;
        attendees?: { created: number; updated: number; total: number };
        venue?: { created: boolean; updated: boolean };
        error?: string;
      };
      if (!res.ok) {
        setSyncState({ kind: "error", message: data.error ?? "Sync failed" });
        return;
      }
      setSyncState({
        kind: "ok",
        tiers: data.tiers ?? [],
        event: data.event,
        attendees: data.attendees ?? undefined,
        venue: data.venue ?? undefined,
      });
    } catch (err) {
      setSyncState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  const isSyncing = syncState.kind === "loading";
  const isSynced = syncState.kind === "ok";

  // ── Spotify search (debounced) ────────────────────────────────────────────────

  function handleSpotifyQueryChange(value: string) {
    setSpotifyQuery(value);
    setSelectedArtists(new Set());
    setSpotifySyncState({ kind: "idle" });

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSearchState({ kind: "idle" });
      return;
    }

    setSearchState({ kind: "searching" });
    debounceRef.current = setTimeout(() => void searchArtists(value.trim()), 400);
  }

  async function searchArtists(q: string) {
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { artists?: SpotifyArtist[]; error?: string };
      if (!res.ok) {
        setSearchState({ kind: "error", message: data.error ?? "Search failed" });
        return;
      }
      const artists = data.artists ?? [];
      setSearchState(artists.length === 0 ? { kind: "empty" } : { kind: "results", artists });
    } catch (err) {
      setSearchState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  function toggleArtist(id: string) {
    setSelectedArtists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSpotifySyncState({ kind: "idle" });
  }

  // ── Spotify sync ──────────────────────────────────────────────────────────────

  async function handleSpotifySync() {
    if (!rosterDbId || selectedArtists.size === 0) return;
    if (searchState.kind !== "results") return;

    const toSync = searchState.artists.filter((a) => selectedArtists.has(a.id));
    setSpotifySyncState({ kind: "syncing" });

    try {
      const res = await fetch("/api/spotify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artists: toSync, notionDbId: rosterDbId }),
      });
      const data = (await res.json()) as { synced?: number; error?: string };
      if (!res.ok) {
        setSpotifySyncState({ kind: "error", message: data.error ?? "Sync failed" });
        return;
      }
      setSpotifySyncState({ kind: "ok", count: data.synced ?? toSync.length });
    } catch (err) {
      setSpotifySyncState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  const isSyncingSpotify = spotifySyncState.kind === "syncing";
  const isSyncedSpotify = spotifySyncState.kind === "ok";

  // ── Content generation ────────────────────────────────────────────────────────

  async function handleGenerateContent() {
    if (!eventUrl.trim()) return;
    setContentGenState({ kind: "generating" });

    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: eventUrl.trim(),
          channel: contentChannel,
          genre: contentGenre.trim() || undefined,
          vibe: contentVibe.trim() || undefined,
          rosterDbId: rosterDbId || undefined,
          socialDbId: socialDbId || undefined,
          adCopiesDbId: adCopiesDbId || undefined,
          flyerDbId: flyerDbId || undefined,
          writeToNotion: Boolean(workspace),
          generateImage: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        tone?: {
          label: string;
          sellThroughPct: number | null;
          daysUntilSalesEnd: number | null;
        };
        draft?: GeneratedDraftPreview;
        imageUrl?: string | null;
        imageWarning?: string;
        notion?: {
          socialPageId: string | null;
          adCopyPageId: string | null;
          flyerPageId: string | null;
        };
      };

      if (!res.ok || !data.draft || !data.tone) {
        setContentGenState({
          kind: "error",
          message: data.error ?? "Generation failed",
        });
        return;
      }

      setContentGenState({
        kind: "ok",
        tone: {
          label: data.tone.label,
          sellThroughPct: data.tone.sellThroughPct,
          daysUntilSalesEnd: data.tone.daysUntilSalesEnd,
        },
        draft: data.draft,
        imageUrl: data.imageUrl ?? null,
        imageWarning: data.imageWarning,
        notion: data.notion ?? {
          socialPageId: null,
          adCopyPageId: null,
          flyerPageId: null,
        },
      });
      requestAnimationFrame(() => {
        contentStudioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setContentGenState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
      requestAnimationFrame(() => {
        contentStudioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  const isGeneratingContent = contentGenState.kind === "generating";

  // ── Calendar planner ──────────────────────────────────────────────────────────

  async function handlePlanCalendar(writeToNotion = calendarWriteToNotion) {
    if (!workspace) return;
    setCalendarPlanState({ kind: "planning" });

    try {
      const res = await fetch("/api/calendar/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hubPageId: hubPageId || undefined,
          venuesDbId: venueDbId || undefined,
          ticketTiersDbId: notionDbId || undefined,
          rosterDbId: rosterDbId || undefined,
          socialDbId: socialDbId || undefined,
          logisticsDbId: logisticsDbId || undefined,
          adCopiesDbId: adCopiesDbId || undefined,
          flyerDbId: flyerDbId || undefined,
          writeToNotion,
          weeksBefore: 4,
          weeksAfter: 1,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        plan?: {
          summary: string;
          eventDate: string | null;
          items: CalendarPlanItemView[];
        };
        applied?: { socialCreated: number; logisticsCreated: number; skipped: number };
      };

      if (!res.ok || !data.plan) {
        setCalendarPlanState({
          kind: "error",
          message: data.error ?? "Calendar planning failed",
        });
        return;
      }

      setCalendarPlanState({
        kind: "ok",
        summary: data.plan.summary,
        eventDate: data.plan.eventDate,
        items: data.plan.items,
        applied: data.applied,
      });
      requestAnimationFrame(() => {
        calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setCalendarPlanState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  const isPlanningCalendar = calendarPlanState.kind === "planning";

  const calendarByDate =
    calendarPlanState.kind === "ok"
      ? calendarPlanState.items.reduce<Record<string, CalendarPlanItemView[]>>((acc, item) => {
          const list = acc[item.date] ?? [];
          list.push(item);
          acc[item.date] = list;
          return acc;
        }, {})
      : {};

  // ── Instagram ─────────────────────────────────────────────────────────────────

  async function loadPendingPosts() {
    if (!socialDbId) return;
    setIgLoadState({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/instagram/pending?notionDbId=${encodeURIComponent(socialDbId)}`,
      );
      const data = (await res.json()) as { posts?: PendingPost[]; error?: string };
      if (!res.ok) {
        setIgLoadState({ kind: "error", message: data.error ?? "Failed to load posts" });
        return;
      }
      const posts = data.posts ?? [];
      setIgLoadState(posts.length === 0 ? { kind: "empty" } : { kind: "loaded", posts });
      setPostPublishStates({});
      setPostImageUrls({});
    } catch (err) {
      setIgLoadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function publishPost(post: PendingPost) {
    const imageUrl = (postImageUrls[post.id] ?? "").trim();
    if (!imageUrl) {
      setPostPublishStates((prev) => ({
        ...prev,
        [post.id]: { kind: "error", message: "Paste a public image URL before publishing." },
      }));
      return;
    }

    setPostPublishStates((prev) => ({ ...prev, [post.id]: { kind: "publishing" } }));

    try {
      const res = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionPageId: post.id, caption: post.caption, imageUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; postId?: string; error?: string; newToken?: string };
      if (!res.ok) {
        setPostPublishStates((prev) => ({
          ...prev,
          [post.id]: { kind: "error", message: data.error ?? "Publish failed" },
        }));
        return;
      }
      setPostPublishStates((prev) => ({
        ...prev,
        [post.id]: { kind: "ok", postId: data.postId ?? "" },
      }));
      // Remove the published post from the loaded list
      setIgLoadState((prev) => {
        if (prev.kind !== "loaded") return prev;
        const remaining = prev.posts.filter((p) => p.id !== post.id);
        return remaining.length === 0 ? { kind: "empty" } : { kind: "loaded", posts: remaining };
      });
    } catch (err) {
      setPostPublishStates((prev) => ({
        ...prev,
        [post.id]: {
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        },
      }));
    }
  }

  async function loadMetrics() {
    setMetricsState({ kind: "loading" });
    try {
      const res = await fetch("/api/instagram/metrics");
      const data = (await res.json()) as { posts?: PostMetric[]; error?: string };
      if (!res.ok) {
        setMetricsState({ kind: "error", message: data.error ?? "Failed to load metrics" });
        return;
      }
      const posts = data.posts ?? [];
      setMetricsState(posts.length === 0 ? { kind: "empty" } : { kind: "loaded", posts });
    } catch (err) {
      setMetricsState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function syncMetricsToNotion() {
    if (!socialDbId) return;
    setMetricsSyncState({ kind: "syncing" });
    try {
      const res = await fetch("/api/instagram/metrics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionDbId: socialDbId }),
      });
      const data = (await res.json()) as {
        updated?: number;
        created?: number;
        error?: string;
      };
      if (!res.ok) {
        setMetricsSyncState({ kind: "error", message: data.error ?? "Sync failed" });
        return;
      }
      setMetricsSyncState({
        kind: "ok",
        updated: data.updated ?? 0,
        created: data.created ?? 0,
      });
    } catch (err) {
      setMetricsSyncState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function syncEngagementFunnel() {
    if (!funnelDbId) return;
    setFunnelSyncState({ kind: "syncing" });
    try {
      const res = await fetch("/api/instagram/funnel/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionDbId: funnelDbId }),
      });
      const data = (await res.json()) as {
        comments?: { created: number; updated: number };
        messages?: { created: number; updated: number };
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) {
        setFunnelSyncState({ kind: "error", message: data.error ?? "Sync failed" });
        return;
      }
      setFunnelSyncState({
        kind: "ok",
        comments: data.comments ?? { created: 0, updated: 0 },
        messages: data.messages ?? { created: 0, updated: 0 },
        warnings: data.warnings,
      });
    } catch (err) {
      setFunnelSyncState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
<<<<<<< HEAD
    <div className="flex min-h-[calc(100vh-3rem)] flex-col bg-[#C38F6C]">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Sync integrations
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Push live data from external services into your Notion festival
              workspace databases.
            </p>
          </div>
          <Link
            href="/chat"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "shrink-0 border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white",
            )}
          >
            Continue to Chat →
          </Link>
=======
    <div className="flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <span className="text-sm font-medium">Notion Fest</span>
        <nav className="flex items-center gap-2">
          <Link
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            href="/preview"
          >
            Preview
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            href="/chat"
          >
            Chat planner
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            href="/"
          >
            Home
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sync integrations
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Push live data from external services into your Notion festival
            workspace databases.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              onClick={() => void handleGenerateContent()}
              disabled={!eventUrl.trim() || isGeneratingContent}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isGeneratingContent ? "Generating AI draft…" : "Generate AI draft + image"}
            </Button>
            {!eventUrl.trim() ? (
              <p className="text-muted-foreground text-xs">
                Add an Eventbrite event URL below to enable generation.
              </p>
            ) : contentGenState.kind === "ok" ? (
              <p className="text-muted-foreground text-xs">
                Last run: {contentGenState.tone.label}
                {contentGenState.imageUrl ? " · image ready" : ""}
              </p>
            ) : null}
            {hasCalendarSources ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePlanCalendar(false)}
                disabled={isPlanningCalendar}
              >
                {isPlanningCalendar ? "Planning…" : "Plan calendar from Notion"}
              </Button>
            ) : null}
          </div>
>>>>>>> d185e4fa291796d474e37747070634a97f2084d4
        </div>

        {/* Workspace connection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected workspace</CardTitle>
            <CardDescription>
              {workspace
                ? "Using the workspace created from this session."
                : "No workspace found from this session. Paste your database IDs below, or go to Preview to create one first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {workspace ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm font-medium truncate">
                  Festival hub
                </span>
                <a
                  href={workspace.hubPageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline-offset-4 hover:underline"
                >
                  Open in Notion
                </a>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="manualDbId">
                  Ticket tiers database ID
                </label>
                <Input
                  id="manualDbId"
                  value={manualDbId}
                  onChange={(e) => setManualDbId(e.target.value)}
                  placeholder="Paste the Notion DB URL or raw UUID"
                />
                <p className="text-muted-foreground text-xs">
                  Open the Ticket tiers DB in Notion, copy the URL from your
                  browser — we extract the ID automatically.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hub — agentic writes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notion hub — Agent writes</CardTitle>
            <CardDescription>
              Push briefings, quick-action to-dos, status reports, and rich
              structure blocks directly onto your festival hub page (headings,
              lists, timeline, metrics embed, and more).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!hubPageId ? (
              <p className="text-muted-foreground text-sm">
                Connect a workspace above or create one from Chat / Preview first.
              </p>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="hubBriefing">
                    Agent briefing
                  </label>
                  <Textarea
                    id="hubBriefing"
                    value={hubBriefing}
                    onChange={(e) => setHubBriefing(e.target.value)}
                    placeholder="Summarize decisions, risks, or next steps…"
                    rows={3}
                    disabled={isHubWriting}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="hubTodos">
                    Quick-action to-dos
                  </label>
                  <Input
                    id="hubTodos"
                    value={hubTodos}
                    onChange={(e) => setHubTodos(e.target.value)}
                    placeholder="Book headliner, Confirm venue deposit, …"
                    disabled={isHubWriting}
                  />
                  <p className="text-muted-foreground text-xs">
                    Comma-separated items append under Quick Actions on the hub.
                  </p>
                </div>
                <div className="grid gap-2 rounded-md border border-border p-3">
                  <p className="text-sm font-medium">Regenerate hub structure</p>
                  <p className="text-muted-foreground text-xs">
                    Re-appends intro, timeline, and section blocks (optional festival
                    settings for the overview callout).
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={hubRegenBudget}
                      onChange={(e) => setHubRegenBudget(e.target.value)}
                      placeholder="Budget"
                      disabled={isHubWriting}
                    />
                    <Input
                      value={hubRegenGenre}
                      onChange={(e) => setHubRegenGenre(e.target.value)}
                      placeholder="Genre"
                      disabled={isHubWriting}
                    />
                    <Input
                      value={hubRegenDates}
                      onChange={(e) => setHubRegenDates(e.target.value)}
                      placeholder="Dates"
                      disabled={isHubWriting}
                    />
                    <Input
                      value={hubRegenVibe}
                      onChange={(e) => setHubRegenVibe(e.target.value)}
                      placeholder="Vibe"
                      disabled={isHubWriting}
                    />
                  </div>
                </div>
              </>
            )}

            {hubWriteState.kind === "ok" ? (
              <p className="text-sm text-green-700 dark:text-green-400">
                {hubWriteState.message}
              </p>
            ) : null}
            {hubWriteState.kind === "error" ? (
              <p className="text-destructive text-sm">{hubWriteState.message}</p>
            ) : null}
          </CardContent>
          {hubPageId ? (
            <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                onClick={() => void handleHubBriefing()}
                disabled={!hubBriefing.trim() || isHubWriting}
              >
                {isHubWriting ? "Writing…" : "Post briefing"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleHubTodos()}
                disabled={!hubTodos.trim() || isHubWriting}
              >
                Add to-dos
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleHubStatus()}
                disabled={isHubWriting}
              >
                Status report
              </Button>
              <Button
                variant="outline"
                onClick={() => void postHubAction("chart")}
                disabled={isHubWriting}
              >
                Refresh chart embed
              </Button>
              <Button
                variant="ghost"
                onClick={() => void handleHubRegenerate()}
                disabled={isHubWriting}
              >
                Regenerate hub structure
              </Button>
              {workspace?.hubPageUrl ? (
                <a
                  className={cn(buttonVariants({ variant: "link" }), "text-sm")}
                  href={workspace.hubPageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open hub in Notion
                </a>
              ) : null}
            </CardFooter>
          ) : null}
        </Card>

        {/* Eventbrite */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventbrite — Full event sync</CardTitle>
            <CardDescription>
              Sync ticket tiers, venue/event details, and attendee guest list from
              one Eventbrite URL into your Notion workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="eventUrl">
                Eventbrite event URL
              </label>
              <Input
                id="eventUrl"
                value={eventUrl}
                onChange={(e) => setEventUrl(e.target.value)}
                placeholder="https://www.eventbrite.com/e/your-event-name-1234567890"
                disabled={isSyncing || isSynced}
              />
              <p className="text-muted-foreground text-xs">
                Paste the full event URL or just the numeric ID.
              </p>
            </div>

            {workspace ? (
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={syncVenue}
                    onChange={(e) => setSyncVenue(e.target.checked)}
                    disabled={!venueDbId || isSyncing || isSynced}
                  />
                  <span>Sync venue &amp; event info</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={syncAttendees}
                    onChange={(e) => setSyncAttendees(e.target.checked)}
                    disabled={!attendeesDbId || isSyncing || isSynced}
                  />
                  <span>Sync attendee guest list</span>
                </label>
              </div>
            ) : null}

            {syncState.kind === "ok" ? (
              <div className="rounded-md border border-border">
                <div className="grid grid-cols-5 gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Tier</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Sold</span>
                  <span className="text-right">Left</span>
                  <span className="text-right">Status</span>
                </div>
                {syncState.tiers.map((tier) => (
                  <div
                    key={tier.name}
                    className="grid grid-cols-5 gap-2 px-3 py-2 text-sm last:rounded-b-md odd:bg-muted/40"
                  >
                    <span className="truncate font-medium">{tier.name}</span>
                    <span className="text-right text-muted-foreground">
                      {tier.price === 0 ? "Free" : `$${tier.price}`}
                    </span>
                    <span className="text-right text-muted-foreground">{tier.sold}</span>
                    <span className="text-right text-muted-foreground">
                      {tier.remaining ?? "—"}
                    </span>
                    <span className="truncate text-right text-xs text-muted-foreground">
                      {tier.onSaleStatus ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {syncState.kind === "error" ? (
              <p className="text-destructive text-sm">{syncState.message}</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              onClick={() => void handleEventbriteSync()}
              disabled={!notionDbId || !eventUrl.trim() || isSyncing || isSynced}
            >
              {isSyncing
                ? "Syncing…"
                : isSynced
                  ? `Synced ${(syncState as { tiers: SyncedTier[] }).tiers.length} tiers`
                  : "Sync Eventbrite"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleGenerateContent()}
              disabled={!eventUrl.trim() || isGeneratingContent}
            >
              {isGeneratingContent ? "Generating…" : "Generate AI draft"}
            </Button>
            {isSynced && ticketTiersUrl ? (
              <a
                className={cn(buttonVariants({ variant: "outline" }))}
                href={ticketTiersUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Ticket tiers in Notion
              </a>
            ) : null}
          </CardFooter>
        </Card>

        {/* Spotify */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spotify — DJ / Artist roster</CardTitle>
            <CardDescription>
              Search for artists on Spotify, select the ones performing at your
              festival, and sync them into the Notion DJ / Artist roster
              database with follower counts and genres pre-filled.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Manual roster DB ID when no workspace is connected */}
            {!workspace ? (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="manualRosterDbId">
                  DJ / Artist roster database ID
                </label>
                <Input
                  id="manualRosterDbId"
                  value={manualRosterDbId}
                  onChange={(e) => setManualRosterDbId(e.target.value)}
                  placeholder="Paste the Notion DB URL or raw UUID"
                />
              </div>
            ) : null}

            {/* Search bar */}
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="spotifyQuery">
                Search artists
              </label>
              <Input
                id="spotifyQuery"
                value={spotifyQuery}
                onChange={(e) => handleSpotifyQueryChange(e.target.value)}
                placeholder="Type an artist name…"
                autoComplete="off"
                disabled={isSyncedSpotify}
              />
              <p className="text-muted-foreground text-xs">
                Results appear as you type. Select artists then hit Sync.
              </p>
            </div>

            {/* Search state feedback */}
            {searchState.kind === "searching" ? (
              <p className="text-muted-foreground text-sm">Searching…</p>
            ) : null}

            {searchState.kind === "empty" ? (
              <p className="text-muted-foreground text-sm">
                No artists found for &ldquo;{spotifyQuery}&rdquo;.
              </p>
            ) : null}

            {searchState.kind === "error" ? (
              <p className="text-destructive text-sm">{searchState.message}</p>
            ) : null}

            {/* Results list */}
            {searchState.kind === "results" ? (
              <div className="rounded-md border border-border divide-y divide-border">
                {searchState.artists.map((artist) => {
                  const isSelected = selectedArtists.has(artist.id);
                  return (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => toggleArtist(artist.id)}
                      disabled={isSyncedSpotify}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-md last:rounded-b-md",
                        isSelected
                          ? "bg-primary/10 hover:bg-primary/15"
                          : "hover:bg-muted/60",
                        isSyncedSpotify && "pointer-events-none opacity-60",
                      )}
                    >
                      {/* Checkbox indicator */}
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {isSelected ? "✓" : ""}
                      </span>

                      {/* Artist image */}
                      {artist.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={artist.imageUrl}
                          alt={artist.name}
                          className="h-10 w-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-lg">
                          🎵
                        </span>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{artist.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {artist.followers.toLocaleString("en-US")} followers
                          {artist.genres.length > 0
                            ? ` · ${artist.genres.join(", ")}`
                            : ""}
                        </p>
                      </div>

                      {/* Popularity bar */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {artist.popularity}
                        </span>
                        <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${artist.popularity}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Selection count */}
            {selectedArtists.size > 0 && !isSyncedSpotify ? (
              <p className="text-sm text-muted-foreground">
                {selectedArtists.size} artist{selectedArtists.size !== 1 ? "s" : ""} selected
              </p>
            ) : null}

            {/* Sync error */}
            {spotifySyncState.kind === "error" ? (
              <p className="text-destructive text-sm">{spotifySyncState.message}</p>
            ) : null}

            {/* Success */}
            {spotifySyncState.kind === "ok" ? (
              <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                  Synced {spotifySyncState.count} artist{spotifySyncState.count !== 1 ? "s" : ""} to Notion
                </p>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={() => void handleSpotifySync()}
              disabled={
                !rosterDbId ||
                selectedArtists.size === 0 ||
                isSyncingSpotify ||
                isSyncedSpotify ||
                searchState.kind !== "results"
              }
            >
              {isSyncingSpotify
                ? "Syncing…"
                : isSyncedSpotify
                  ? `Synced ${(spotifySyncState as { count: number }).count} artists`
                  : selectedArtists.size > 0
                    ? `Sync ${selectedArtists.size} artist${selectedArtists.size !== 1 ? "s" : ""} to Notion`
                    : "Sync to Notion"}
            </Button>
            {isSyncedSpotify && rosterUrl ? (
              <a
                className={cn(buttonVariants({ variant: "outline" }))}
                href={rosterUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open DJ roster in Notion
              </a>
            ) : null}
          </CardFooter>
        </Card>

        {/* AI Content Studio */}
        <Card
          id="content-studio"
          ref={contentStudioRef}
          className="border-violet-200/60 dark:border-violet-900/50 scroll-mt-6"
        >
          <CardHeader>
            <CardTitle className="text-base">AI Content Studio</CardTitle>
            <CardDescription>
              Agentic draft generator — pulls Eventbrite sales timing for tone,
              Spotify roster for lineup context, writes captions to Social schedule
              and Ad copies, and generates a DALL·E promo image ready for Instagram.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="contentChannel">
                  Channel
                </label>
                <select
                  id="contentChannel"
                  value={contentChannel}
                  onChange={(e) => setContentChannel(e.target.value as ContentChannel)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  disabled={isGeneratingContent}
                >
                  <option value="Instagram">Instagram</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Email">Email</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="contentGenre">
                  Genre (optional)
                </label>
                <Input
                  id="contentGenre"
                  value={contentGenre}
                  onChange={(e) => setContentGenre(e.target.value)}
                  placeholder="e.g. house / techno"
                  disabled={isGeneratingContent}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="contentVibe">
                  Vibe (optional)
                </label>
                <Input
                  id="contentVibe"
                  value={contentVibe}
                  onChange={(e) => setContentVibe(e.target.value)}
                  placeholder="e.g. desert sunset rave"
                  disabled={isGeneratingContent}
                />
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              Uses the Eventbrite URL above. Sync Spotify artists first for lineup-aware
              copy. Tone adapts to ticket sales end dates and sell-through.
            </p>

            {contentGenState.kind === "error" ? (
              <p className="text-destructive text-sm">{contentGenState.message}</p>
            ) : null}

            {contentGenState.kind === "ok" ? (
              <div className="grid gap-4 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                    Tone: {contentGenState.tone.label}
                  </span>
                  {contentGenState.tone.sellThroughPct != null ? (
                    <span className="text-muted-foreground">
                      {contentGenState.tone.sellThroughPct}% sold
                    </span>
                  ) : null}
                  {contentGenState.tone.daysUntilSalesEnd != null ? (
                    <span className="text-muted-foreground">
                      Sales end in {contentGenState.tone.daysUntilSalesEnd}d
                    </span>
                  ) : null}
                </div>

                {contentGenState.imageUrl ? (
                  <img
                    src={contentGenState.imageUrl}
                    alt="Generated festival promo"
                    className="mx-auto max-h-64 w-auto rounded-lg border border-border object-contain"
                  />
                ) : null}

                {contentGenState.imageWarning ? (
                  <p className="text-amber-600 dark:text-amber-400 text-xs">
                    {contentGenState.imageWarning}
                  </p>
                ) : null}

                <div className="grid gap-2 text-sm">
                  <p className="font-medium">{contentGenState.draft.headline}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                    {contentGenState.draft.caption}
                  </p>
                  {contentGenState.draft.hashtags.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {contentGenState.draft.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
                    </p>
                  ) : null}
                </div>

                {workspace &&
                (contentGenState.notion.socialPageId ||
                  contentGenState.notion.adCopyPageId) ? (
                  <p className="text-green-600 dark:text-green-400 text-xs font-medium">
                    Saved to Notion — Social schedule
                    {contentGenState.notion.adCopyPageId ? " · Ad copies" : ""}
                    {contentGenState.notion.flyerPageId ? " · Flyer designs" : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              onClick={() => void handleGenerateContent()}
              disabled={!eventUrl.trim() || isGeneratingContent}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isGeneratingContent ? "Generating draft…" : "Generate draft + image"}
            </Button>
            {contentGenState.kind === "ok" && socialUrl ? (
              <a
                className={cn(buttonVariants({ variant: "outline" }))}
                href={socialUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Social schedule
              </a>
            ) : null}
            {contentGenState.kind === "ok" && adCopiesUrl ? (
              <a
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                href={adCopiesUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ad copies
              </a>
            ) : null}
            {contentGenState.kind === "ok" && flyerUrl ? (
              <a
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                href={flyerUrl}
                target="_blank"
                rel="noreferrer"
              >
                Flyer designs
              </a>
            ) : null}
          </CardFooter>
        </Card>

        {/* Festival calendar planner */}
        <Card
          id="festival-calendar"
          ref={calendarRef}
          className="border-sky-200/60 dark:border-sky-900/50 scroll-mt-6"
        >
          <CardHeader>
            <CardTitle className="text-base">Festival calendar planner</CardTitle>
            <CardDescription>
              Reads your Notion workspace (ticket tiers, venues, roster, existing posts)
              and builds a combined marketing + logistics timeline — when to post and what
              ops tasks to tackle.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!workspace ? (
              <p className="text-muted-foreground text-sm">
                Connect a workspace from Chat or Preview first — this tool uses your
                synced Notion databases as the source of truth.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={calendarWriteToNotion}
                  onChange={(e) => setCalendarWriteToNotion(e.target.checked)}
                  disabled={isPlanningCalendar}
                />
                <span>Write plan to Social schedule &amp; logistics checklist</span>
              </label>
            )}

            {calendarPlanState.kind === "error" ? (
              <p className="text-destructive text-sm">{calendarPlanState.message}</p>
            ) : null}

            {calendarPlanState.kind === "ok" ? (
              <div className="grid gap-4">
                <p className="text-sm leading-relaxed">{calendarPlanState.summary}</p>
                {calendarPlanState.eventDate ? (
                  <p className="text-muted-foreground text-xs">
                    Event date:{" "}
                    {new Date(calendarPlanState.eventDate).toLocaleDateString("en-US", {
                      dateStyle: "long",
                    })}
                  </p>
                ) : null}
                {calendarPlanState.applied ? (
                  <p className="text-green-600 dark:text-green-400 text-xs font-medium">
                    Wrote {calendarPlanState.applied.socialCreated} social rows ·{" "}
                    {calendarPlanState.applied.logisticsCreated} logistics tasks
                    {calendarPlanState.applied.skipped > 0
                      ? ` · ${calendarPlanState.applied.skipped} preview-only`
                      : ""}
                  </p>
                ) : null}
                <div className="max-h-[28rem] overflow-y-auto rounded-md border border-border">
                  {Object.entries(calendarByDate).map(([date, items]) => (
                    <div key={date} className="border-b border-border last:border-0">
                      <div className="bg-muted/50 px-3 py-2 text-xs font-semibold sticky top-0">
                        {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <ul className="divide-y divide-border">
                        {items.map((item, i) => (
                          <li key={`${date}-${i}`} className="px-3 py-2.5 text-sm grid gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                                  CALENDAR_TYPE_STYLES[item.type] ?? "bg-muted",
                                )}
                              >
                                {item.type.replace("_", " ")}
                              </span>
                              {item.platform ? (
                                <span className="text-muted-foreground text-xs">
                                  {item.platform}
                                </span>
                              ) : null}
                              {item.logisticsCategory ? (
                                <span className="text-muted-foreground text-xs">
                                  {item.logisticsCategory}
                                </span>
                              ) : null}
                              <span className="text-muted-foreground text-xs capitalize">
                                {item.priority}
                              </span>
                            </div>
                            <p className="font-medium">{item.title}</p>
                            <p className="text-muted-foreground text-xs leading-relaxed">
                              {item.description}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              onClick={() => void handlePlanCalendar(calendarWriteToNotion)}
              disabled={!hasCalendarSources || isPlanningCalendar}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              {isPlanningCalendar ? "Analyzing Notion…" : "Build festival calendar"}
            </Button>
            {calendarPlanState.kind === "ok" && !calendarPlanState.applied ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handlePlanCalendar(true)}
                disabled={isPlanningCalendar}
              >
                Apply to Notion
              </Button>
            ) : null}
            {socialUrl ? (
              <a
                className={cn(buttonVariants({ variant: "outline" }))}
                href={socialUrl}
                target="_blank"
                rel="noreferrer"
              >
                Social schedule
              </a>
            ) : null}
            {logisticsUrl ? (
              <a
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                href={logisticsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Logistics checklist
              </a>
            ) : null}
          </CardFooter>
        </Card>

        {/* Instagram */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instagram — Social schedule</CardTitle>
            <CardDescription>
              Load unpublished Instagram posts from your Notion Social schedule
              database, attach a public image URL to each, and publish them
              directly to your Instagram Business account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Manual Social schedule DB ID when no workspace is connected */}
            {!workspace ? (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="manualSocialDbId">
                  Social schedule database ID
                </label>
                <Input
                  id="manualSocialDbId"
                  value={manualSocialDbId}
                  onChange={(e) => setManualSocialDbId(e.target.value)}
                  placeholder="Paste the Notion DB URL or raw UUID"
                />
              </div>
            ) : null}

            {/* Load state feedback */}
            {igLoadState.kind === "loading" ? (
              <p className="text-muted-foreground text-sm">Loading pending posts…</p>
            ) : null}

            {igLoadState.kind === "error" ? (
              <p className="text-destructive text-sm">{igLoadState.message}</p>
            ) : null}

            {igLoadState.kind === "empty" ? (
              <div className="rounded-md border border-border px-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No pending Instagram posts found. Add rows to your Social
                  schedule DB with Platform set to &ldquo;Instagram&rdquo; and
                  Published unchecked.
                </p>
              </div>
            ) : null}

            {/* Pending posts list */}
            {igLoadState.kind === "loaded" ? (
              <div className="grid gap-3">
                {igLoadState.posts.map((post) => {
                  const publishState = postPublishStates[post.id] ?? { kind: "idle" };
                  const isPublishing = publishState.kind === "publishing";
                  const isPublished = publishState.kind === "ok";

                  return (
                    <div
                      key={post.id}
                      className="rounded-md border border-border p-3 grid gap-2"
                    >
                      {/* Caption */}
                      <p className="text-sm font-medium leading-snug line-clamp-3">
                        {post.caption || <span className="text-muted-foreground italic">No caption</span>}
                      </p>

                      {/* Go-live date */}
                      {post.goLive ? (
                        <p className="text-xs text-muted-foreground">
                          Scheduled: {new Date(post.goLive).toLocaleDateString("en-US", { dateStyle: "medium" })}
                        </p>
                      ) : null}

                      {/* Image URL input */}
                      {!isPublished ? (
                        <Input
                          value={postImageUrls[post.id] ?? ""}
                          onChange={(e) =>
                            setPostImageUrls((prev) => ({ ...prev, [post.id]: e.target.value }))
                          }
                          placeholder="https://… public image URL (required by Instagram)"
                          disabled={isPublishing}
                          className="text-xs h-8"
                        />
                      ) : null}

                      {/* Per-post publish error */}
                      {publishState.kind === "error" ? (
                        <p className="text-destructive text-xs">{publishState.message}</p>
                      ) : null}

                      {/* Published badge */}
                      {isPublished ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            Published
                          </span>
                          <span className="text-xs text-muted-foreground">
                            · Post ID: {publishState.postId}
                          </span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void publishPost(post)}
                          disabled={isPublishing || !socialDbId}
                          className="w-fit"
                        >
                          {isPublishing ? "Publishing…" : "Publish to Instagram"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant={igLoadState.kind === "loaded" ? "outline" : "default"}
              onClick={() => void loadPendingPosts()}
              disabled={!socialDbId || igLoadState.kind === "loading"}
            >
              {igLoadState.kind === "loading"
                ? "Loading…"
                : igLoadState.kind === "loaded"
                  ? "Refresh posts"
                  : "Load pending posts"}
            </Button>
            {socialUrl ? (
              <a
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                href={socialUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Social schedule in Notion
              </a>
            ) : null}
          </CardFooter>
        </Card>

        {/* Instagram engagement funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instagram — Engagement funnel</CardTitle>
            <CardDescription>
              Sync comments and DMs into Notion as a triage board: New → In
              progress → Replied → Closed. Reply from Notion via the API using
              each row&apos;s page ID (or wire an automation to{" "}
              <code className="text-xs">POST /api/instagram/funnel/reply</code>
              ).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!workspace ? (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="manualFunnelDbId">
                  Instagram engagement funnel database ID
                </label>
                <Input
                  id="manualFunnelDbId"
                  value={manualFunnelDbId}
                  onChange={(e) => setManualFunnelDbId(e.target.value)}
                  placeholder="Paste the Notion DB URL or raw UUID"
                />
              </div>
            ) : null}

            {funnelSyncState.kind === "syncing" ? (
              <p className="text-muted-foreground text-sm">
                Syncing comments and messages…
              </p>
            ) : null}

            {funnelSyncState.kind === "error" ? (
              <p className="text-destructive text-sm">{funnelSyncState.message}</p>
            ) : null}

            {funnelSyncState.kind === "ok" ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <p>
                  Comments: {funnelSyncState.comments.created} new,{" "}
                  {funnelSyncState.comments.updated} updated
                </p>
                <p>
                  DMs: {funnelSyncState.messages.created} new,{" "}
                  {funnelSyncState.messages.updated} updated
                </p>
                {funnelSyncState.warnings?.map((warning) => (
                  <p key={warning} className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <ul className="text-muted-foreground list-disc pl-5 text-xs leading-relaxed">
              <li>Comments from your 10 most recent posts</li>
              <li>Inbound DMs only (someone must message you first)</li>
              <li>
                In Meta Development mode, only Instagram Testers&apos; comments and DMs
                are returned — not regular followers
              </li>
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={() => void syncEngagementFunnel()}
              disabled={!funnelDbId || funnelSyncState.kind === "syncing"}
            >
              {funnelSyncState.kind === "syncing" ? "Syncing…" : "Sync funnel to Notion"}
            </Button>
            {funnelUrl ? (
              <a
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                href={funnelUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open funnel in Notion
              </a>
            ) : null}
          </CardFooter>
        </Card>

        {/* Instagram metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instagram — Post metrics</CardTitle>
            <CardDescription>
              Pull engagement data for your 25 most recent Instagram posts —
              likes, comments, views, reach, and saves. Sync writes into Social
              schedule (creates rows for posts not already tracked).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {metricsState.kind === "loading" ? (
              <p className="text-muted-foreground text-sm">Loading metrics…</p>
            ) : null}

            {metricsState.kind === "error" ? (
              <p className="text-destructive text-sm">{metricsState.message}</p>
            ) : null}

            {metricsState.kind === "empty" ? (
              <p className="text-muted-foreground text-sm">
                No posts found on this Instagram account.
              </p>
            ) : null}

            {metricsState.kind === "loaded" ? (
              <div className="rounded-md border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Post</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Likes</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Comments</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Views</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Reach</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricsState.posts.map((post, i) => (
                      <tr
                        key={post.id}
                        className={cn(
                          "border-b border-border last:border-0",
                          i % 2 === 1 ? "bg-muted/20" : "",
                        )}
                      >
                        <td className="px-3 py-2 max-w-[200px]">
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs hover:underline underline-offset-4"
                            title={post.caption}
                          >
                            {post.caption
                              ? post.caption.slice(0, 60) + (post.caption.length > 60 ? "…" : "")
                              : <span className="text-muted-foreground italic">No caption</span>}
                          </a>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(post.timestamp).toLocaleDateString("en-US", { dateStyle: "medium" })}
                            {" · "}
                            {post.mediaType.replace("_", " ").toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{post.likes.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{post.comments.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {post.views > 0 ? post.views.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {post.reach > 0 ? post.reach.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {post.saved > 0 ? post.saved.toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              variant={metricsState.kind === "loaded" ? "outline" : "default"}
              onClick={() => void loadMetrics()}
              disabled={metricsState.kind === "loading"}
            >
              {metricsState.kind === "loading"
                ? "Loading…"
                : metricsState.kind === "loaded"
                  ? "Refresh metrics"
                  : "Load post metrics"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void syncMetricsToNotion()}
              disabled={!socialDbId || metricsSyncState.kind === "syncing"}
            >
              {metricsSyncState.kind === "syncing"
                ? "Syncing to Notion…"
                : "Sync metrics to Notion"}
            </Button>
            {metricsSyncState.kind === "ok" ? (
              <span className="text-muted-foreground text-xs">
                {metricsSyncState.updated} updated · {metricsSyncState.created} created
              </span>
            ) : null}
            {metricsSyncState.kind === "error" ? (
              <span className="text-destructive text-xs">{metricsSyncState.message}</span>
            ) : null}
          </CardFooter>
        </Card>

        {/* Coming soon */}
        <div className="grid gap-3">
          <p className="text-white/60 text-xs font-medium uppercase tracking-wider">
            Coming soon
          </p>
          {COMING_SOON.map((integration) => (
            <Card key={integration.id} className="opacity-50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{integration.label}</CardTitle>
                  <span className="text-muted-foreground rounded border border-border px-1.5 py-0.5 text-xs">
                    Not configured
                  </span>
                </div>
                <CardDescription className="text-xs">
                  {integration.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
