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
import { cn } from "@/lib/utils";
import type { NotionSetupResponse } from "@/types/festival";

// ─── Eventbrite types ──────────────────────────────────────────────────────────

interface SyncedTier {
  name: string;
  price: number;
  capacity: number;
  sold: number;
}

type EventbriteSyncState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; tiers: SyncedTier[] }
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
  impressions: number;
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

type PostPublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "ok"; postId: string }
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

  // Spotify state
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [searchState, setSearchState] = useState<SpotifySearchState>({ kind: "idle" });
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const [spotifySyncState, setSpotifySyncState] = useState<SpotifySyncState>({ kind: "idle" });
  const [manualRosterDbId, setManualRosterDbId] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Instagram state
  const [manualSocialDbId, setManualSocialDbId] = useState("");
  const [igLoadState, setIgLoadState] = useState<InstagramLoadState>({ kind: "idle" });
  const [postImageUrls, setPostImageUrls] = useState<Record<string, string>>({});
  const [postPublishStates, setPostPublishStates] = useState<Record<string, PostPublishState>>({});
  const [metricsState, setMetricsState] = useState<MetricsLoadState>({ kind: "idle" });

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

  const notionDbId = workspace?.databaseIds["Ticket tiers"] ?? manualDbId.trim();
  const ticketTiersUrl = workspace?.databaseUrls["Ticket tiers"];
  const rosterDbId = workspace?.databaseIds["DJ / Artist roster"] ?? manualRosterDbId.trim();
  const rosterUrl = workspace?.databaseUrls["DJ / Artist roster"];
  const socialDbId = workspace?.databaseIds["Social schedule"] ?? manualSocialDbId.trim();
  const socialUrl = workspace?.databaseUrls["Social schedule"];

  // ── Eventbrite ────────────────────────────────────────────────────────────────

  async function handleEventbriteSync() {
    if (!notionDbId || !eventUrl.trim()) return;
    setSyncState({ kind: "loading" });
    try {
      const res = await fetch("/api/eventbrite/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: eventUrl.trim(), notionDbId }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "Sync failed";
        setSyncState({ kind: "error", message: msg });
        return;
      }
      setSyncState({ kind: "ok", tiers: (data as { tiers: SyncedTier[] }).tiers });
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

  return (
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

        {/* Eventbrite */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventbrite — Ticket tiers</CardTitle>
            <CardDescription>
              Pull ticket classes (name, price, capacity, sold) from your
              Eventbrite event and sync them into the Notion Ticket tiers
              database.
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

            {syncState.kind === "ok" ? (
              <div className="rounded-md border border-border">
                <div className="grid grid-cols-4 gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Tier</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Capacity</span>
                  <span className="text-right">Sold</span>
                </div>
                {syncState.tiers.map((tier) => (
                  <div
                    key={tier.name}
                    className="grid grid-cols-4 gap-2 px-3 py-2 text-sm last:rounded-b-md odd:bg-muted/40"
                  >
                    <span className="font-medium">{tier.name}</span>
                    <span className="text-right text-muted-foreground">
                      {tier.price === 0 ? "Free" : `$${tier.price}`}
                    </span>
                    <span className="text-right text-muted-foreground">
                      {tier.capacity}
                    </span>
                    <span className="text-right text-muted-foreground">
                      {tier.sold}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {syncState.kind === "error" ? (
              <p className="text-destructive text-sm">{syncState.message}</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        {/* Instagram metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instagram — Post metrics</CardTitle>
            <CardDescription>
              Pull engagement data for your 25 most recent Instagram posts —
              likes, comments, impressions, reach, and saves.
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
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Impressions</th>
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
                          {post.impressions > 0 ? post.impressions.toLocaleString() : "—"}
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
          <CardFooter>
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
