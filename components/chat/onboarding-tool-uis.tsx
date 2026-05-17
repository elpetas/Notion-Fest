"use client";

import { useAui, useAssistantToolUI } from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  readPendingOnboarding,
  savePendingOnboarding,
} from "@/lib/onboarding-pending-storage";
import {
  buildEventbriteSyncBody,
  postEventbriteSync,
} from "@/lib/onboarding/sync-eventbrite";
import { cn } from "@/lib/utils";
import type {
  ArtistBookingStatus,
  EventbriteEventInfo,
  FestivalSettings,
  NotionSetupResponse,
} from "@/types/festival";

const panelClass =
  "mt-2 rounded-xl border border-white/20 bg-white/10 p-4 text-sm text-white/90 backdrop-blur-sm";

interface EventbriteImportResult {
  ok: boolean;
  event?: EventbriteEventInfo;
  dateRange?: string;
  synced?: { tiers?: number; venue?: boolean };
  error?: string;
}

interface SpotifyArtist {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string[];
  imageUrl: string | null;
  spotifyUrl: string;
}

interface IgPostMetric {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string;
  permalink: string;
  likes: number;
  comments: number;
}

const BOOKING_STATUSES: { id: ArtistBookingStatus; label: string }[] = [
  { id: "wishlist", label: "Wishlist" },
  { id: "pending", label: "Pending" },
  { id: "booked", label: "Booked" },
];

function formatCapacity(cap: number | null | undefined): string {
  if (cap == null) return "Capacity TBD";
  return `${cap.toLocaleString()} attendees`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-16 shrink-0 text-white/50">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EventbritePanel({
  initialUrl,
  workspace,
  serverResult,
  onImported,
}: {
  initialUrl?: string;
  workspace: NotionSetupResponse | null;
  serverResult?: EventbriteImportResult;
  onImported: (event: EventbriteEventInfo, eventUrl?: string) => void;
}) {
  const aui = useAui();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventbriteEventInfo | null>(
    serverResult?.ok && serverResult.event ? serverResult.event : null,
  );
  const autoRan = useRef(false);

  const runImport = useCallback(
    async (eventUrl: string) => {
      const trimmed = eventUrl.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      try {
        const previewRes = await fetch(
          `/api/eventbrite/preview?eventId=${encodeURIComponent(trimmed)}`,
        );
        const preview = (await previewRes.json()) as {
          event?: EventbriteEventInfo;
          error?: string;
        };
        if (!previewRes.ok || !preview.event) {
          setError(preview.error ?? "Could not load event");
          return;
        }
        setEvent(preview.event);
        savePendingOnboarding({
          eventbriteUrl: trimmed,
          eventbrite: preview.event,
        });
        if (workspace?.databaseIds?.["Ticket tiers"]) {
          const body = buildEventbriteSyncBody(workspace, trimmed);
          if (body) {
            const { ok, data } = await postEventbriteSync(body);
            if (!ok) {
              setError(data.error ?? "Could not sync ticket tiers to Notion");
            } else if (data.warnings?.length) {
              setError(data.warnings.join(" "));
            }
          }
        }
        onImported(preview.event, trimmed);
        const cap = preview.event.capacity ?? preview.event.venueCapacity;
        void aui.thread().append({
          role: "user",
          content: [
            {
              type: "text",
              text: `Eventbrite imported: ${preview.event.name} at ${preview.event.venueName || "TBD"} — ${formatCapacity(cap)}.`,
            },
          ],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      } finally {
        setLoading(false);
      }
    },
    [aui, onImported, workspace],
  );

  useEffect(() => {
    if (serverResult?.ok && serverResult.event) {
      setEvent(serverResult.event);
      const url =
        initialUrl?.trim() || serverResult.event.url || serverResult.event.id;
      savePendingOnboarding({
        eventbriteUrl: url,
        eventbrite: serverResult.event,
      });
      onImported(serverResult.event, url);
    }
  }, [serverResult, onImported, initialUrl]);

  useEffect(() => {
    if (initialUrl?.trim() && !autoRan.current) {
      autoRan.current = true;
      void runImport(initialUrl);
    }
  }, [initialUrl, runImport]);

  if (event) {
    const cap = event.capacity ?? event.venueCapacity;
    return (
      <div className={panelClass}>
        <p className="font-medium text-white">Event linked</p>
        <div className="mt-2 space-y-1">
          <DetailRow label="Festival" value={event.name} />
          <DetailRow
            label="Dates"
            value={
              serverResult?.dateRange ??
              new Date(event.startUtc).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            }
          />
          <DetailRow label="Venue" value={event.venueName || "TBD"} />
          <DetailRow label="Capacity" value={formatCapacity(cap)} />
          {event.venueAddress ? (
            <DetailRow label="Address" value={event.venueAddress} />
          ) : null}
        </div>
        {serverResult?.synced ? (
          <p className="mt-2 text-xs text-emerald-200/90">
            Synced to Notion
            {serverResult.synced.tiers != null
              ? ` · ${serverResult.synced.tiers} ticket tier(s)`
              : ""}
            {serverResult.synced.venue ? " · venue row" : ""}
          </p>
        ) : (
          <p className="mt-2 text-xs text-white/60">
            Saved locally — ticket tiers, attendees, and venue will sync when you deploy your worker.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <p className="font-medium text-white">Paste your Eventbrite event link</p>
      <p className="mt-1 text-xs text-white/60">
        We&apos;ll pull the festival name, dates, venue, and capacity.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.eventbrite.com/e/…"
          className="border-white/30 bg-white/10 text-white placeholder:text-white/50"
          disabled={loading}
        />
        <Button
          type="button"
          disabled={loading || !url.trim()}
          className="shrink-0 rounded-xl"
          onClick={() => void runImport(url)}
        >
          {loading ? "Importing…" : "Import event"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}


function InstagramPanel({
  workspace,
  onExported,
}: {
  workspace: NotionSetupResponse | null;
  onExported: () => void;
}) {
  const aui = useAui();
  const socialDbId = workspace?.databaseIds?.["Social schedule"];
  const funnelDbId = workspace?.databaseIds?.["Instagram engagement funnel"];
  const [posts, setPosts] = useState<IgPostMetric[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/instagram/metrics");
        const data = (await res.json()) as { posts?: IgPostMetric[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Failed to load posts");
          return;
        }
        const list = data.posts ?? [];
        if (!cancelled) {
          setPosts(list);
          setSelected(new Set(list.slice(0, 3).map((p) => p.id)));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveSelection() {
    if (selected.size === 0) return;
    setExporting(true);
    setError(null);
    const chosen = posts.filter((p) => selected.has(p.id));

    try {
      if (socialDbId) {
        const res = await fetch("/api/instagram/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notionDbId: socialDbId,
            postIds: [...selected],
            funnelDbId: funnelDbId || undefined,
            syncAllMetrics: false,
          }),
        });
        const data = (await res.json()) as { exported?: number; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Export failed");
          return;
        }
        setDone(true);
        onExported();
        void aui.thread().append({
          role: "user",
          content: [
            {
              type: "text",
              text: `Exported ${data.exported ?? selected.size} Instagram post(s) to the hub. Comments and funnel synced automatically.`,
            },
          ],
        });
        return;
      }

      savePendingOnboarding({
        instagramPosts: chosen.map((p) => ({
          id: p.id,
          caption: p.caption,
          mediaType: p.mediaType,
          timestamp: p.timestamp,
          permalink: p.permalink,
          likes: p.likes,
          comments: p.comments,
        })),
      });
      setDone(true);
      onExported();
      void aui.thread().append({
        role: "user",
        content: [
          {
            type: "text",
            text: `Saved ${chosen.length} Instagram post(s) for the hub. They will sync to Notion when you create your workspace at the end.`,
          },
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className={panelClass}>Loading your latest Instagram posts…</div>;
  }

  if (done) {
    return (
      <div className={panelClass}>
        <p className="font-medium text-white">Instagram posts saved</p>
        <p className="mt-1 text-xs text-white/70">
          {socialDbId
            ? "Selected posts are on your Social schedule. Comments and DMs synced to the engagement funnel."
            : "Your picks are queued — they will sync when you create your hub at the end."}
        </p>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <p className="font-medium text-white">Choose posts for your hub</p>
      <p className="mt-1 text-xs text-white/60">
        Select posts for your Social schedule. They sync to Notion when your hub is created at the end.
      </p>
      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {posts.map((post) => (
          <li key={post.id}>
            <label className="flex cursor-pointer gap-2 rounded-lg border border-white/15 bg-white/5 p-2 hover:bg-white/10">
              <input
                type="checkbox"
                className="mt-1 shrink-0"
                checked={selected.has(post.id)}
                onChange={() => toggle(post.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-xs text-white/90">
                  {post.caption || "(no caption)"}
                </span>
                <span className="mt-0.5 block text-[10px] text-white/50">
                  {new Date(post.timestamp).toLocaleDateString()} · {post.likes} likes · {post.comments} comments
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {posts.length === 0 ? (
        <p className="mt-2 text-xs text-white/60">No posts found on this Instagram account.</p>
      ) : null}
      <Button
        type="button"
        className="mt-3 w-full rounded-xl sm:w-auto"
        disabled={exporting || selected.size === 0}
        onClick={() => void handleSaveSelection()}
      >
        {exporting
          ? "Saving…"
          : socialDbId
            ? `Export ${selected.size} to Notion`
            : `Save ${selected.size} post${selected.size === 1 ? "" : "s"}`}
      </Button>
      {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}

function ArtistPanel({
  workspace,
  onExported,
}: {
  workspace: NotionSetupResponse | null;
  onExported: () => void;
}) {
  const aui = useAui();
  const rosterDbId = workspace?.databaseIds?.["DJ / Artist roster"];
  const [query, setQuery] = useState("");
  const [artists, setArtists] = useState<SpotifyArtist[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusById, setStatusById] = useState<Record<string, ArtistBookingStatus>>({});
  const [defaultStatus, setDefaultStatus] = useState<ArtistBookingStatus>("wishlist");
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setArtists([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { artists?: SpotifyArtist[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Search failed");
          setArtists([]);
          return;
        }
        setError(null);
        setArtists(data.artists ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        setStatusById((s) => ({ ...s, [id]: s[id] ?? defaultStatus }));
      }
      return next;
    });
  }

  async function handleSaveSelection() {
    if (selected.size === 0) return;
    const toSync = artists.filter((a) => selected.has(a.id));
    const statusMap: Record<string, ArtistBookingStatus> = {};
    for (const a of toSync) {
      statusMap[a.id] = statusById[a.id] ?? defaultStatus;
    }
    setExporting(true);
    setError(null);
    try {
      if (rosterDbId) {
        const res = await fetch("/api/spotify/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artists: toSync,
            notionDbId: rosterDbId,
            statusByArtistId: statusMap,
          }),
        });
        const data = (await res.json()) as { synced?: number; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Export failed");
          return;
        }
        setDone(true);
        onExported();
        void aui.thread().append({
          role: "user",
          content: [
            {
              type: "text",
              text: `Added ${data.synced ?? toSync.length} artist(s) to the DJ roster in Notion.`,
            },
          ],
        });
        return;
      }

      const existing = readPendingOnboarding()?.artists ?? [];
      const byId = new Map(existing.map((a) => [a.id, a]));
      for (const a of toSync) {
        byId.set(a.id, {
          ...a,
          bookingStatus: statusMap[a.id] ?? "wishlist",
        });
      }
      const merged = [...byId.values()];
      savePendingOnboarding({ artists: merged });
      setDone(true);
      onExported();
      void aui.thread().append({
        role: "user",
        content: [
          {
            type: "text",
            text: `Saved ${merged.length} artist(s) for the hub. They will sync to the DJ roster when you create your workspace at the end.`,
          },
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setExporting(false);
    }
  }

  if (done) {
    return (
      <div className={panelClass}>
        <p className="font-medium text-white">Artist roster saved</p>
        <p className="mt-1 text-xs text-white/70">
          {rosterDbId
            ? "Your picks are in the DJ / Artist roster database."
            : "Your picks are queued — they will sync when you create your hub at the end."}
        </p>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <p className="font-medium text-white">Search artists & set booking status</p>
      <p className="mt-1 text-xs text-white/60">
        Tag artists as wishlist, pending, or booked. They sync to Notion when your hub is created at the end.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">Default status</span>
        {BOOKING_STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setDefaultStatus(s.id)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs transition-colors",
              defaultStatus === s.id
                ? "bg-white/25 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/15",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search artist name…"
        className="mt-3 border-white/30 bg-white/10 text-white placeholder:text-white/50"
      />
      {searching ? <p className="mt-2 text-xs text-white/50">Searching…</p> : null}
      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
        {artists.map((artist) => (
          <li
            key={artist.id}
            className={cn(
              "rounded-lg border border-white/15 p-2",
              selected.has(artist.id) ? "bg-white/15" : "bg-white/5",
            )}
          >
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(artist.id)}
                onChange={() => toggle(artist.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-white">{artist.name}</span>
                <span className="block text-[10px] text-white/50">
                  {artist.followers.toLocaleString()} followers
                  {artist.genres[0] ? ` · ${artist.genres[0]}` : ""}
                </span>
              </span>
            </label>
            {selected.has(artist.id) ? (
              <div className="mt-2 flex flex-wrap gap-1 pl-6">
                {BOOKING_STATUSES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStatusById((prev) => ({ ...prev, [artist.id]: s.id }))}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px]",
                      (statusById[artist.id] ?? defaultStatus) === s.id
                        ? "bg-white/30 text-white"
                        : "bg-white/10 text-white/60",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Button
        type="button"
        className="mt-3 w-full rounded-xl sm:w-auto"
        disabled={exporting || selected.size === 0}
        onClick={() => void handleSaveSelection()}
      >
        {exporting
          ? "Saving…"
          : rosterDbId
            ? `Export ${selected.size} to Notion`
            : `Save ${selected.size} artist${selected.size === 1 ? "" : "s"}`}
      </Button>
      {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}

function dateRangeFromEvent(event: EventbriteEventInfo): string {
  const start = new Date(event.startUtc);
  if (Number.isNaN(start.getTime())) return "TBD";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const startStr = start.toLocaleDateString(undefined, opts);
  if (!event.endUtc) return startStr;
  const end = new Date(event.endUtc);
  if (Number.isNaN(end.getTime()) || start.toDateString() === end.toDateString()) {
    return startStr;
  }
  return `${startStr} – ${end.toLocaleDateString(undefined, opts)}`;
}

function FestivalSettingsPanel({
  event,
  onConfirmed,
}: {
  event?: EventbriteEventInfo | null;
  onConfirmed: (settings: FestivalSettings) => void;
}) {
  const aui = useAui();
  const [settings, setSettings] = useState<FestivalSettings>(() => ({
    budget: "",
    genre: "",
    dateRange: event ? dateRangeFromEvent(event) : "",
    vibe: event?.name ?? "",
  }));
  const [done, setDone] = useState(false);

  const canSubmit =
    settings.budget.trim().length > 0 &&
    settings.genre.trim().length > 0 &&
    settings.vibe.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    const final: FestivalSettings = {
      budget: settings.budget.trim(),
      genre: settings.genre.trim(),
      dateRange: settings.dateRange.trim() || "TBD",
      vibe: settings.vibe.trim(),
    };
    setDone(true);
    onConfirmed(final);
    void aui.thread().append({
      role: "user",
      content: [
        {
          type: "text",
          text: `Festival settings: budget ${final.budget}, genre ${final.genre}, dates ${final.dateRange}, vibe — ${final.vibe}.`,
        },
      ],
    });
  }

  if (done) {
    return (
      <div className={panelClass}>
        <p className="font-medium text-white">Festival settings saved</p>
        <ul className="mt-1.5 space-y-0.5 text-xs text-white/75">
          <li>Budget: {settings.budget}</li>
          <li>Genre: {settings.genre}</li>
          <li>Dates: {settings.dateRange}</li>
          <li>Vibe: {settings.vibe}</li>
        </ul>
        <p className="mt-2 text-xs text-white/60">
          Click Deploy Worker below to create your Notion hub.
        </p>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <p className="font-medium text-white">Festival budget & vibe</p>
      <p className="mt-1 text-xs text-white/60">
        Lock in your planning numbers — then deploy your Notion worker.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">
            Budget
          </span>
          <Input
            value={settings.budget}
            onChange={(e) => setSettings((s) => ({ ...s, budget: e.target.value }))}
            placeholder="e.g. $5–10k"
            className="border-white/30 bg-white/10 text-white placeholder:text-white/50"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">
            Genre
          </span>
          <Input
            value={settings.genre}
            onChange={(e) => setSettings((s) => ({ ...s, genre: e.target.value }))}
            placeholder="e.g. reggaeton, trap latino"
            className="border-white/30 bg-white/10 text-white placeholder:text-white/50"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">
            Dates
          </span>
          <Input
            value={settings.dateRange}
            onChange={(e) => setSettings((s) => ({ ...s, dateRange: e.target.value }))}
            className="border-white/30 bg-white/10 text-white"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">
            Vibe
          </span>
          <Input
            value={settings.vibe}
            onChange={(e) => setSettings((s) => ({ ...s, vibe: e.target.value }))}
            placeholder="Crowd, scale, aesthetic…"
            className="border-white/30 bg-white/10 text-white placeholder:text-white/50"
          />
        </label>
      </div>
      {!canSubmit ? (
        <p className="mt-2 text-xs text-amber-200/90">Enter budget, genre, and vibe to continue.</p>
      ) : null}
      <Button
        type="button"
        className="mt-3 w-full rounded-xl sm:w-auto"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        Save settings
      </Button>
    </div>
  );
}

export interface OnboardingToolUIsProps {
  workspace: NotionSetupResponse | null;
  eventbriteEvent?: EventbriteEventInfo | null;
  onEventbriteImported: (event: EventbriteEventInfo, eventUrl?: string) => void;
  onInstagramExported: () => void;
  onArtistsExported: () => void;
  onSettingsConfirmed: (settings: FestivalSettings) => void;
}

export function OnboardingToolUIs({
  workspace,
  eventbriteEvent,
  onEventbriteImported,
  onInstagramExported,
  onArtistsExported,
  onSettingsConfirmed,
}: OnboardingToolUIsProps) {
  useAssistantToolUI({
    toolName: "presentEventbriteLink",
    render(toolPart) {
      if (toolPart.status.type !== "complete") {
        return <div className={panelClass}>Opening Eventbrite import…</div>;
      }
      return (
        <EventbritePanel workspace={workspace} onImported={onEventbriteImported} />
      );
    },
  });

  useAssistantToolUI({
    toolName: "importEventbriteEvent",
    render(toolPart) {
      const args = toolPart.args as { eventUrl?: string } | undefined;
      const result = toolPart.result as EventbriteImportResult | undefined;
      const isDone = toolPart.status.type === "complete";

      if (!isDone) {
        return (
          <EventbritePanel
            initialUrl={args?.eventUrl}
            workspace={workspace}
            onImported={onEventbriteImported}
          />
        );
      }

      if (result && !result.ok) {
        return (
          <EventbritePanel
            initialUrl={args?.eventUrl}
            workspace={workspace}
            serverResult={result}
            onImported={onEventbriteImported}
          />
        );
      }

      return (
        <EventbritePanel
          initialUrl={args?.eventUrl}
          workspace={workspace}
          serverResult={result}
          onImported={onEventbriteImported}
        />
      );
    },
  });

  useAssistantToolUI({
    toolName: "presentInstagramPostPicker",
    render(toolPart) {
      if (toolPart.status.type !== "complete") {
        return <div className={panelClass}>Loading Instagram picker…</div>;
      }
      return <InstagramPanel workspace={workspace} onExported={onInstagramExported} />;
    },
  });

  useAssistantToolUI({
    toolName: "presentArtistRosterPicker",
    render(toolPart) {
      if (toolPart.status.type !== "complete") {
        return <div className={panelClass}>Loading artist search…</div>;
      }
      return <ArtistPanel workspace={workspace} onExported={onArtistsExported} />;
    },
  });

  useAssistantToolUI({
    toolName: "presentFestivalSettingsForm",
    render(toolPart) {
      if (toolPart.status.type !== "complete") {
        return <div className={panelClass}>Loading festival settings…</div>;
      }
      return (
        <FestivalSettingsPanel event={eventbriteEvent} onConfirmed={onSettingsConfirmed} />
      );
    },
  });

  return null;
}
