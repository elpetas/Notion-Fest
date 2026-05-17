/**
 * Auto-discover database IDs from a festival hub page by title.
 * For hackathon demo: can auto-discover the first page in workspace too.
 */

import { getNotionClient } from "./client";

const NOTION_VERSION = "2022-06-28";

/**
 * Finds the first page in a workspace (for demo/hackathon simplicity).
 */
async function findFirstPageInWorkspace(): Promise<string | null> {
  const token = process.env.NOTION_API_KEY?.trim();
  if (!token) {
    throw new Error("NOTION_API_KEY is not configured");
  }

  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      page_size: 1,
    }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message ?? `Failed to search pages (${res.status})`);
  }

  const data = (await res.json()) as {
    results: Array<{ id: string }>;
  };

  return data.results[0]?.id ?? null;
}

interface ChildDatabase {
  id: string;
  title: string;
}

/**
 * Lists all child databases of a page.
 */
async function listChildDatabases(pageId: string): Promise<ChildDatabase[]> {
  const token = process.env.NOTION_API_KEY?.trim();
  if (!token) {
    throw new Error("NOTION_API_KEY is not configured");
  }

  const databases: ChildDatabase[] = [];
  let cursor: string | undefined;

  do {
    const res = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?${cursor ? `start_cursor=${cursor}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
        },
      },
    );

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? `Failed to list page children (${res.status})`);
    }

    const data = (await res.json()) as {
      results: Array<{
        type: string;
        id: string;
        child_database?: { title: string };
      }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const block of data.results) {
      if (block.type === "child_database" && block.child_database) {
        databases.push({
          id: block.id,
          title: block.child_database.title,
        });
      }
    }

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return databases;
}

export interface DiscoveredDatabases {
  venuesDbId: string | undefined;
  ticketTiersDbId: string | undefined;
  rosterDbId: string | undefined;
  socialDbId: string | undefined;
  logisticsDbId: string | undefined;
  adCopiesDbId: string | undefined;
  flyerDbId: string | undefined;
  attendeesDbId: string | undefined;
  audienceDbId: string | undefined;
}

const DATABASE_TITLE_MAP: Record<string, keyof DiscoveredDatabases> = {
  Venues: "venuesDbId",
  "Ticket tiers": "ticketTiersDbId",
  "DJ / Artist roster": "rosterDbId",
  "Social schedule": "socialDbId",
  "Merchandise & logistics checklist": "logisticsDbId",
  "Ad copies": "adCopiesDbId",
  "Flyer designs": "flyerDbId",
  "Attendee list": "attendeesDbId",
  Audience: "audienceDbId",
};

/**
 * Discovers database IDs from a hub page by matching known titles.
 */
export async function discoverDatabasesFromHub(
  hubPageId: string,
): Promise<DiscoveredDatabases> {
  const children = await listChildDatabases(hubPageId);
  const discovered: DiscoveredDatabases = {
    venuesDbId: undefined,
    ticketTiersDbId: undefined,
    rosterDbId: undefined,
    socialDbId: undefined,
    logisticsDbId: undefined,
    adCopiesDbId: undefined,
    flyerDbId: undefined,
    attendeesDbId: undefined,
    audienceDbId: undefined,
  };

  for (const db of children) {
    const key = DATABASE_TITLE_MAP[db.title];
    if (key) {
      discovered[key] = db.id;
    }
  }

  return discovered;
}

/**
 * Merges explicit IDs with discovered IDs (explicit takes precedence).
 */
export function mergeWithDiscovered(
  explicit: Partial<DiscoveredDatabases>,
  discovered: DiscoveredDatabases,
): DiscoveredDatabases {
  return {
    venuesDbId: explicit.venuesDbId || discovered.venuesDbId,
    ticketTiersDbId: explicit.ticketTiersDbId || discovered.ticketTiersDbId,
    rosterDbId: explicit.rosterDbId || discovered.rosterDbId,
    socialDbId: explicit.socialDbId || discovered.socialDbId,
    logisticsDbId: explicit.logisticsDbId || discovered.logisticsDbId,
    adCopiesDbId: explicit.adCopiesDbId || discovered.adCopiesDbId,
    flyerDbId: explicit.flyerDbId || discovered.flyerDbId,
    attendeesDbId: explicit.attendeesDbId || discovered.attendeesDbId,
    audienceDbId: explicit.audienceDbId || discovered.audienceDbId,
  };
}

/**
 * Hackathon-demo mode: discovers EVERYTHING automatically.
 * Finds first page in workspace, then discovers databases from it.
 */
export async function autoDiscoverEverything(): Promise<{
  hubPageId: string;
  databases: DiscoveredDatabases;
}> {
  const hubPageId = await findFirstPageInWorkspace();
  if (!hubPageId) {
    throw new Error("No pages found in workspace");
  }

  const databases = await discoverDatabasesFromHub(hubPageId);
  return { hubPageId, databases };
}
