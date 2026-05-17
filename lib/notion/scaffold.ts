/**
 * Creates a festival planning hub page plus eight category databases under a parent page.
 * The parent must already grant access to the Notion integration tied to NOTION_API_KEY.
 */

import type { Client, CreateDatabaseParameters } from "@notionhq/client";

import type { FestivalSettings, NotionSetupResponse } from "@/types/festival";

/** public web URL for a page/database id (works for pages opened in browser) */
function notionBrowseUrl(notionId: string): string {
  return `https://www.notion.so/${notionId.replace(/-/g, "")}`;
}

/** normalize id from env (Notion URL, dashed UUID, or raw 32-char hex) */
export function normalizeNotionPageId(raw: string): string {
  const trimmed = raw.trim();
  const dashed =
    trimmed.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    )?.[0] ?? null;
  if (dashed) {
    return dashed;
  }
  const compact = trimmed.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  }
  throw new Error(
    "Invalid NOTION_PAGE_ID — expected a Notion page UUID (or URL containing one).",
  );
}

export async function scaffoldFestivalWorkspace(
  notion: Client,
  parentPageId: string,
  settings: FestivalSettings,
  options?: { hubTitle?: string },
): Promise<NotionSetupResponse> {
  const parentId = normalizeNotionPageId(parentPageId);

  const trimmedCustomTitle = options?.hubTitle?.trim();
  const hubTitle =
    trimmedCustomTitle && trimmedCustomTitle.length > 0
      ? trimmedCustomTitle
      : `Festival hub — ${settings.genre}`;

  const hub = await notion.pages.create({
    parent: { type: "page_id", page_id: parentId },
    properties: {
      title: {
        title: [
          {
            type: "text",
            text: { content: hubTitle },
          },
        ],
      },
    },
  });

  const hubId = hub.id;

  await notion.blocks.children.append({
    block_id: hubId,
    children: [
      {
        type: "callout",
        callout: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `Budget: ${settings.budget}\nDates: ${settings.dateRange}\nVibe: ${settings.vibe}`,
              },
            },
          ],
          icon: { type: "emoji", emoji: "🎪" },
        },
      },
    ],
  });

  const dbVenues = await createDatabase(notion, hubId, "Venues", {
    Name: { title: {} },
    Capacity: { number: { format: "number" } },
    Notes: { rich_text: {} },
    Status: {
      select: {
        options: [
          { name: "Idea", color: "gray" },
          { name: "Shortlist", color: "yellow" },
          { name: "Booked", color: "green" },
        ],
      },
    },
  });

  const dbFlyers = await createDatabase(notion, hubId, "Flyer designs", {
    Name: { title: {} },
    Concept: { rich_text: {} },
    Status: {
      select: {
        options: [
          { name: "Draft", color: "gray" },
          { name: "Review", color: "yellow" },
          { name: "Approved", color: "green" },
        ],
      },
    },
  });

  const dbAds = await createDatabase(notion, hubId, "Ad copies", {
    Name: { title: {} },
    Body: { rich_text: {} },
    Channel: {
      select: {
        options: [
          { name: "Instagram", color: "purple" },
          { name: "TikTok", color: "pink" },
          { name: "Email", color: "blue" },
          { name: "Other", color: "gray" },
        ],
      },
    },
  });

  const dbAudience = await createDatabase(notion, hubId, "Audience", {
    Segment: { title: {} },
    Notes: { rich_text: {} },
    Priority: {
      select: {
        options: [
          { name: "Core", color: "red" },
          { name: "Stretch", color: "yellow" },
          { name: "Experimental", color: "blue" },
        ],
      },
    },
  });

  const dbSocial = await createDatabase(notion, hubId, "Social schedule", {
    Post: { title: {} },
    Platform: {
      select: {
        options: [
          { name: "Instagram", color: "purple" },
          { name: "TikTok", color: "pink" },
          { name: "Twitter / X", color: "gray" },
          { name: "Other", color: "brown" },
        ],
      },
    },
    "Go-live": { date: {} },
    Notes: { rich_text: {} },
  });

  const dbDjs = await createDatabase(notion, hubId, "DJ roster", {
    Artist: { title: {} },
    "Set notes": { rich_text: {} },
    Fee: { number: { format: "dollar" } },
    Status: {
      select: {
        options: [
          { name: "Wishlist", color: "gray" },
          { name: "Contacted", color: "yellow" },
          { name: "Confirmed", color: "green" },
        ],
      },
    },
  });

  const dbTickets = await createDatabase(notion, hubId, "Ticket tiers", {
    Tier: { title: {} },
    Price: { number: { format: "dollar" } },
    Capacity: { number: { format: "number" } },
    Perks: { rich_text: {} },
  });

  const dbLogistics = await createDatabase(
    notion,
    hubId,
    "Merchandise & logistics checklist",
    {
      Item: { title: {} },
      Category: {
        select: {
          options: [
            { name: "Merch", color: "blue" },
            { name: "Ops", color: "orange" },
            { name: "Security", color: "red" },
            { name: "Other", color: "gray" },
          ],
        },
      },
      Done: { checkbox: {} },
      "Security staffing needed": { checkbox: {} },
      Notes: { rich_text: {} },
    },
  );

  return {
    hubPageUrl: notionBrowseUrl(hubId),
    hubPageId: hubId,
    databaseUrls: {
      Venues: notionBrowseUrl(dbVenues.id),
      "Flyer designs": notionBrowseUrl(dbFlyers.id),
      "Ad copies": notionBrowseUrl(dbAds.id),
      Audience: notionBrowseUrl(dbAudience.id),
      "Social schedule": notionBrowseUrl(dbSocial.id),
      "DJ roster": notionBrowseUrl(dbDjs.id),
      "Ticket tiers": notionBrowseUrl(dbTickets.id),
      "Merchandise & logistics checklist": notionBrowseUrl(dbLogistics.id),
    },
  };
}

type DatabasePropertyMap = NonNullable<
  NonNullable<CreateDatabaseParameters["initial_data_source"]>["properties"]
>;

async function createDatabase(
  notion: Client,
  parentPageId: string,
  title: string,
  properties: DatabasePropertyMap,
) {
  return notion.databases.create({
    parent: { type: "page_id", page_id: parentPageId },
    title: [
      {
        type: "text",
        text: { content: title },
      },
    ],
    initial_data_source: { properties },
  });
}
