/**
 * Reads festival context from Notion workspace databases (source of truth).
 */

import type { NotionWorkspaceSnapshot } from "@/lib/calendar/types";
import {
  checkboxValue,
  dateStart,
  numberValue,
  queryDatabasePages,
  richTextPlain,
  selectName,
  titlePlain,
} from "@/lib/notion/query";

const NOTION_VERSION = "2022-06-28";

export interface WorkspaceDbIds {
  hubPageId?: string;
  venuesDbId?: string;
  ticketTiersDbId?: string;
  rosterDbId?: string;
  socialDbId?: string;
  logisticsDbId?: string;
  adCopiesDbId?: string;
  flyerDbId?: string;
}

async function loadHubCallout(hubPageId: string): Promise<string | null> {
  const token = process.env.NOTION_API_KEY?.trim();
  if (!token) return null;

  const res = await fetch(
    `https://api.notion.com/v1/blocks/${hubPageId}/children?page_size=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{
      type?: string;
      callout?: { rich_text?: Array<{ plain_text?: string }> };
    }>;
  };

  for (const block of data.results ?? []) {
    if (block.type === "callout" && block.callout?.rich_text) {
      return block.callout.rich_text.map((t) => t.plain_text ?? "").join("");
    }
  }

  return null;
}

export async function gatherNotionWorkspace(
  ids: WorkspaceDbIds,
): Promise<NotionWorkspaceSnapshot> {
  const snapshot: NotionWorkspaceSnapshot = {
    hubNotes: ids.hubPageId ? await loadHubCallout(ids.hubPageId) : null,
    venues: [],
    ticketTiers: [],
    roster: [],
    socialScheduled: [],
    logisticsOpen: [],
    adCopiesCount: 0,
    flyersDraftCount: 0,
  };

  if (ids.venuesDbId) {
    const pages = await queryDatabasePages(ids.venuesDbId);
    snapshot.venues = pages.map((p) => ({
      name: titlePlain(p.properties, "Name"),
      eventStart: dateStart(p.properties, "Event start"),
      eventEnd: dateStart(p.properties, "Event end"),
      status: selectName(p.properties, "Status"),
    }));
  }

  if (ids.ticketTiersDbId) {
    const pages = await queryDatabasePages(ids.ticketTiersDbId);
    snapshot.ticketTiers = pages.map((p) => ({
      tier: titlePlain(p.properties, "Tier"),
      sold: numberValue(p.properties, "Sold") ?? 0,
      capacity: numberValue(p.properties, "Capacity") ?? 0,
      salesEnd: dateStart(p.properties, "Sales end"),
      onSaleStatus: richTextPlain(p.properties, "On sale status"),
    }));
  }

  if (ids.rosterDbId) {
    const pages = await queryDatabasePages(ids.rosterDbId);
    snapshot.roster = pages.map((p) => ({
      artist: titlePlain(p.properties, "Artist"),
      status: selectName(p.properties, "Status"),
      notes: richTextPlain(p.properties, "Set notes"),
    }));
  }

  if (ids.socialDbId) {
    const pages = await queryDatabasePages(ids.socialDbId);
    snapshot.socialScheduled = pages.map((p) => ({
      post: titlePlain(p.properties, "Post"),
      platform: selectName(p.properties, "Platform"),
      goLive: dateStart(p.properties, "Go-live"),
      published: checkboxValue(p.properties, "Published"),
    }));
  }

  if (ids.logisticsDbId) {
    const pages = await queryDatabasePages(ids.logisticsDbId);
    snapshot.logisticsOpen = pages
      .filter((p) => !checkboxValue(p.properties, "Done"))
      .map((p) => ({
        item: titlePlain(p.properties, "Item"),
        category: selectName(p.properties, "Category"),
        done: false,
      }));
  }

  if (ids.adCopiesDbId) {
    snapshot.adCopiesCount = (await queryDatabasePages(ids.adCopiesDbId)).length;
  }

  if (ids.flyerDbId) {
    const pages = await queryDatabasePages(ids.flyerDbId);
    snapshot.flyersDraftCount = pages.filter(
      (p) => selectName(p.properties, "Status") === "Draft",
    ).length;
  }

  return snapshot;
}

export function inferEventDate(snapshot: NotionWorkspaceSnapshot): string | null {
  const starts = snapshot.venues
    .map((v) => v.eventStart)
    .filter((d): d is string => Boolean(d))
    .sort();
  return starts[0] ?? null;
}

export function formatSnapshotForPrompt(snapshot: NotionWorkspaceSnapshot): string {
  const eventDate = inferEventDate(snapshot);

  const lines = [
    snapshot.hubNotes ? `Hub planning notes:\n${snapshot.hubNotes}` : null,
    eventDate ? `Primary event date (from Venues): ${eventDate}` : "Event date: unknown",
    "",
    "Venues:",
    snapshot.venues.length
      ? snapshot.venues
          .map(
            (v) =>
              `- ${v.name}: ${v.eventStart ?? "?"} → ${v.eventEnd ?? "?"}, status ${v.status ?? "n/a"}`,
          )
          .join("\n")
      : "- none",
    "",
    "Ticket tiers (from Notion):",
    snapshot.ticketTiers.length
      ? snapshot.ticketTiers
          .map((t) => {
            const pct =
              t.capacity > 0 ? Math.round((t.sold / t.capacity) * 100) : 0;
            return `- ${t.tier}: ${t.sold}/${t.capacity} sold (${pct}%), sales end ${t.salesEnd ?? "n/a"}, status ${t.onSaleStatus || "n/a"}`;
          })
          .join("\n")
      : "- none",
    "",
    "DJ roster:",
    snapshot.roster.length
      ? snapshot.roster
          .map((r) => `- ${r.artist} (${r.status ?? "?"})${r.notes ? `: ${r.notes.slice(0, 80)}` : ""}`)
          .join("\n")
      : "- none",
    "",
    "Existing social schedule:",
    snapshot.socialScheduled.length
      ? snapshot.socialScheduled
          .map(
            (s) =>
              `- [${s.published ? "published" : "draft"}] ${s.goLive ?? "no date"} · ${s.platform ?? "?"} · ${s.post.slice(0, 60)}`,
          )
          .join("\n")
      : "- none",
    "",
    "Open logistics items:",
    snapshot.logisticsOpen.length
      ? snapshot.logisticsOpen
          .map((l) => `- ${l.item} (${l.category ?? "Other"})`)
          .join("\n")
      : "- none",
    "",
    `Ad copies in workspace: ${snapshot.adCopiesCount}`,
    `Flyer designs in Draft: ${snapshot.flyersDraftCount}`,
  ];

  return lines.filter(Boolean).join("\n");
}
