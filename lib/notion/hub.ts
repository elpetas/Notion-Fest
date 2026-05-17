/**
 * Dynamic writes to the festival hub page (briefings, todos, charts, status).
 */

import type { Client } from "@notionhq/client";

import {
  formatSnapshotForPrompt,
  gatherNotionWorkspace,
  type WorkspaceDbIds,
} from "@/lib/calendar/gather-notion";
import type { FestivalSettings } from "@/types/festival";

import {
  appendBlocksBatched,
  bullet,
  embedBlock,
  heading2,
  quote,
  todo,
  type NotionBlockInput,
} from "./blocks";
import { buildFullHubStructure } from "./hub-structure";

const NOTION_VERSION = "2022-06-28";

interface HubBlock {
  id: string;
  type?: string;
  heading_1?: { rich_text?: Array<{ plain_text?: string }> };
  heading_2?: { rich_text?: Array<{ plain_text?: string }> };
  heading_3?: { rich_text?: Array<{ plain_text?: string }> };
  callout?: { rich_text?: Array<{ plain_text?: string }> };
}

async function listHubBlocks(hubPageId: string): Promise<HubBlock[]> {
  const token = process.env.NOTION_API_KEY?.trim();
  if (!token) throw new Error("missing NOTION_API_KEY");

  const results: HubBlock[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(
      `https://api.notion.com/v1/blocks/${hubPageId}/children`,
    );
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`failed to list hub blocks: ${err}`);
    }

    const data = (await res.json()) as {
      results?: HubBlock[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    results.push(...(data.results ?? []));
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

function headingPlain(block: HubBlock): string | null {
  const key =
    block.type === "heading_1"
      ? "heading_1"
      : block.type === "heading_2"
        ? "heading_2"
        : block.type === "heading_3"
          ? "heading_3"
          : null;
  if (!key) return null;
  const rt = block[key]?.rich_text;
  if (!rt?.length) return null;
  return rt.map((t) => t.plain_text ?? "").join("").trim();
}

/** Find the last block id matching a section heading (heading_1/2/3). */
export async function findSectionAnchor(
  hubPageId: string,
  headingText: string,
): Promise<string | null> {
  const blocks = await listHubBlocks(hubPageId);
  const normalized = headingText.trim().toLowerCase();
  let lastMatch: string | null = null;

  for (const block of blocks) {
    const plain = headingPlain(block);
    if (plain && plain.toLowerCase() === normalized) {
      lastMatch = block.id;
    }
  }

  return lastMatch;
}

async function appendAfterAnchor(
  notion: Client,
  hubPageId: string,
  headingText: string,
  children: NotionBlockInput[],
): Promise<{ appended: number; anchorFound: boolean }> {
  const anchor = await findSectionAnchor(hubPageId, headingText);
  if (anchor) {
    await notion.blocks.children.append({
      block_id: hubPageId,
      children,
      after: anchor,
    });
    return { appended: children.length, anchorFound: true };
  }

  await appendBlocksBatched(notion, hubPageId, children);
  return { appended: children.length, anchorFound: false };
}

export async function appendAgentBriefing(
  notion: Client,
  hubPageId: string,
  text: string,
): Promise<{ appended: number; anchorFound: boolean }> {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const body = `[${stamp}] ${text.trim()}`;
  return appendAfterAnchor(notion, hubPageId, "🤖 Agent Briefings", [quote(body)]);
}

export async function appendTodoItems(
  notion: Client,
  hubPageId: string,
  items: string[],
): Promise<{ appended: number; anchorFound: boolean }> {
  const blocks = items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => todo(item, false));

  if (blocks.length === 0) {
    return { appended: 0, anchorFound: false };
  }

  return appendAfterAnchor(notion, hubPageId, "🎯 Quick Actions", blocks);
}

export async function appendTimeline(
  notion: Client,
  hubPageId: string,
  phase: string,
  bullets: string[],
): Promise<{ appended: number; anchorFound: boolean }> {
  const children: NotionBlockInput[] = [
    heading2(phase),
    ...bullets.map((b) => bullet(b)),
  ];
  return appendAfterAnchor(notion, hubPageId, "📅 Festival Timeline", children);
}

export async function appendChartEmbed(
  notion: Client,
  hubPageId: string,
  chartUrl: string,
): Promise<{ appended: number; anchorFound: boolean }> {
  return appendAfterAnchor(notion, hubPageId, "📊 Live Metrics", [
    embedBlock(chartUrl),
  ]);
}

export async function updateOverviewCallout(
  notion: Client,
  hubPageId: string,
  text: string,
): Promise<boolean> {
  const blocks = await listHubBlocks(hubPageId);
  const calloutBlock = blocks.find((b) => b.type === "callout");
  if (!calloutBlock) return false;

  await notion.blocks.update({
    block_id: calloutBlock.id,
    callout: {
      rich_text: [
        {
          type: "text",
          text: { content: text.slice(0, 2000) },
        },
      ],
      icon: { type: "emoji", emoji: "🎪" },
    },
  });

  return true;
}

export async function generateAndWriteStatusReport(
  notion: Client,
  hubPageId: string,
  databaseIds: WorkspaceDbIds,
): Promise<{ report: string; appended: number }> {
  const snapshot = await gatherNotionWorkspace({
    hubPageId,
    venuesDbId: databaseIds.venuesDbId,
    ticketTiersDbId: databaseIds.ticketTiersDbId,
    rosterDbId: databaseIds.rosterDbId,
    socialDbId: databaseIds.socialDbId,
    logisticsDbId: databaseIds.logisticsDbId,
    adCopiesDbId: databaseIds.adCopiesDbId,
    flyerDbId: databaseIds.flyerDbId,
  });

  const report = formatSnapshotForPrompt(snapshot);
  const summary =
    report.length > 1800
      ? `${report.slice(0, 1800)}…`
      : report;

  const result = await appendAgentBriefing(
    notion,
    hubPageId,
    `Status report\n\n${summary}`,
  );

  return { report, appended: result.appended };
}

export async function appendHubStructure(
  notion: Client,
  hubPageId: string,
  settings: FestivalSettings,
): Promise<{ blocksAppended: number }> {
  const blocks = buildFullHubStructure(settings);
  await appendBlocksBatched(notion, hubPageId, blocks);
  return { blocksAppended: blocks.length };
}

export function workspaceDbIdsFromRecord(
  hubPageId: string,
  databaseIds: Record<string, string>,
): WorkspaceDbIds {
  return {
    hubPageId,
    venuesDbId: databaseIds.Venues,
    ticketTiersDbId: databaseIds["Ticket tiers"],
    rosterDbId: databaseIds["DJ roster"] ?? databaseIds["DJ / Artist roster"],
    socialDbId: databaseIds["Social schedule"],
    logisticsDbId: databaseIds["Merchandise & logistics checklist"],
    adCopiesDbId: databaseIds["Ad copies"],
    flyerDbId: databaseIds["Flyer designs"],
  };
}
