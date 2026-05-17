"use client";

import { useState } from "react";

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
import type { FestivalSettings, NotionSetupResponse } from "@/types/festival";

const SAMPLE: FestivalSettings = {
  budget: "$45,000",
  genre: "Indie Electronic / Deep House",
  dateRange: "August 15–17, 2026",
  vibe: "Outdoor warehouse rave, 500–800 attendees, late-night aesthetic, local-first talent",
};

const PHASE_GROUPS: Record<string, string[]> = {
  "Pre-Production": [
    "Master timeline",
    "Budget tracker",
    "Venues",
    "Permits & legal",
  ],
  Talent: ["DJ / Artist roster", "Vendors & suppliers"],
  Marketing: [
    "Audience segments",
    "Social schedule",
    "Instagram engagement funnel",
    "Ad copies",
    "Flyer designs",
    "Press & media",
  ],
  Ticketing: ["Ticket tiers"],
  "Ops & Logistics": [
    "Merchandise & logistics checklist",
    "Staff & volunteers",
    "Run of show",
  ],
  "Post-Event": ["Debrief & lessons"],
};

type NotionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: NotionSetupResponse }
  | { kind: "error"; message: string };

interface SyncedTier {
  name: string;
  price: number;
  capacity: number;
  sold: number;
}

type SyncState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; tiers: SyncedTier[] }
  | { kind: "error"; message: string };

export default function PreviewPage() {
  const [settings, setSettings] = useState<FestivalSettings>(SAMPLE);
  const [notionState, setNotionState] = useState<NotionState>({ kind: "idle" });
  const [eventId, setEventId] = useState("");
  const [syncState, setSyncState] = useState<SyncState>({ kind: "idle" });

  function update(field: keyof FestivalSettings) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setSettings((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleExport() {
    setNotionState({ kind: "loading" });
    let workspace: NotionSetupResponse | null = null;
    try {
      const res = await fetch("/api/notion/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
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
      workspace = data as NotionSetupResponse;
      setNotionState({ kind: "ok", data: workspace });
      try {
        localStorage.setItem("notionFestWorkspace", JSON.stringify(workspace));
      } catch {
        // localStorage unavailable — silently ignore
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error calling Notion";
      setNotionState({ kind: "error", message });
      return;
    }

    // Auto-sync Eventbrite tickets if a URL was provided upfront
    if (eventId.trim() && workspace) {
      const notionDbId = workspace.databaseIds["Ticket tiers"];
      if (notionDbId) {
        setSyncState({ kind: "loading" });
        try {
          const res = await fetch("/api/eventbrite/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: eventId.trim(), notionDbId }),
          });
          const data: unknown = await res.json();
          if (!res.ok) {
            const msg =
              typeof (data as { error?: string }).error === "string"
                ? (data as { error: string }).error
                : "Eventbrite sync failed";
            setSyncState({ kind: "error", message: msg });
          } else {
            setSyncState({
              kind: "ok",
              tiers: (data as { tiers: SyncedTier[] }).tiers,
            });
          }
        } catch (err) {
          setSyncState({
            kind: "error",
            message: err instanceof Error ? err.message : "Network error during sync",
          });
        }
      }
    }
  }

  const isLoading = notionState.kind === "loading";
  const isSuccess = notionState.kind === "ok";

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col bg-[#C38F6C]">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Festival workspace preview
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Review and edit the festival details below, then export the full
            planning workspace to Notion — six phase sections with 16 databases.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Festival details</CardTitle>
            <CardDescription>
              Pre-filled with sample data. Edit any field before exporting.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="budget">
                Budget
              </label>
              <Input
                id="budget"
                value={settings.budget}
                onChange={update("budget")}
                placeholder="e.g. $45,000"
                disabled={isLoading || isSuccess}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="genre">
                Genre
              </label>
              <Input
                id="genre"
                value={settings.genre}
                onChange={update("genre")}
                placeholder="e.g. Indie Electronic / Deep House"
                disabled={isLoading || isSuccess}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="dateRange">
                Dates
              </label>
              <Input
                id="dateRange"
                value={settings.dateRange}
                onChange={update("dateRange")}
                placeholder="e.g. August 15–17, 2026"
                disabled={isLoading || isSuccess}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="vibe">
                Vibe
              </label>
              <Input
                id="vibe"
                value={settings.vibe}
                onChange={update("vibe")}
                placeholder="Aesthetic, crowd, scale, location hints…"
                disabled={isLoading || isSuccess}
              />
            </div>

            <div className="border-border grid gap-1.5 border-t pt-4">
              <label className="text-sm font-medium" htmlFor="eventId">
                Eventbrite event URL{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                id="eventId"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                placeholder="https://www.eventbrite.com/e/your-event-name-1234567890"
                disabled={isLoading || isSuccess}
              />
              <p className="text-muted-foreground text-xs">
                If provided, ticket tiers will be synced from Eventbrite
                automatically after the workspace is created.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={() => void handleExport()}
              disabled={isLoading || isSuccess}
            >
              {isLoading
                ? eventId.trim()
                  ? "Creating & syncing…"
                  : "Creating workspace…"
                : isSuccess
                  ? "Workspace created"
                  : eventId.trim()
                    ? "Export to Notion + sync tickets"
                    : "Export to Notion"}
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

        {isSuccess && (syncState.kind !== "idle") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eventbrite ticket sync</CardTitle>
              <CardDescription>
                {syncState.kind === "loading"
                  ? "Pulling ticket tiers from Eventbrite…"
                  : syncState.kind === "ok"
                    ? `${syncState.tiers.length} tier${syncState.tiers.length === 1 ? "" : "s"} synced into the Notion Ticket tiers database.`
                    : "Sync encountered an error."}
              </CardDescription>
            </CardHeader>

            {syncState.kind === "ok" ? (
              <CardContent>
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
              </CardContent>
            ) : null}

            {syncState.kind === "error" ? (
              <CardContent>
                <p className="text-destructive text-sm">{syncState.message}</p>
              </CardContent>
            ) : null}

            {(syncState.kind === "ok" || syncState.kind === "error") &&
            notionState.kind === "ok" &&
            notionState.data.databaseUrls["Ticket tiers"] ? (
              <CardFooter>
                <a
                  className={cn(buttonVariants({ variant: "outline" }))}
                  href={notionState.data.databaseUrls["Ticket tiers"]}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Ticket tiers in Notion
                </a>
              </CardFooter>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workspace structure</CardTitle>
            <CardDescription>
              What will be created in Notion — 6 phase sections, 16 databases.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {Object.entries(PHASE_GROUPS).map(([phase, dbs]) => (
              <div key={phase}>
                <p className="text-sm font-semibold">{phase}</p>
                <ul className="mt-1 grid gap-1">
                  {dbs.map((db) => {
                    const url =
                      notionState.kind === "ok"
                        ? notionState.data.databaseUrls[db]
                        : null;
                    return (
                      <li
                        key={db}
                        className="text-muted-foreground flex items-center gap-2 text-sm"
                      >
                        <span className="text-xs">—</span>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground underline-offset-4 hover:underline"
                          >
                            {db}
                          </a>
                        ) : (
                          db
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
