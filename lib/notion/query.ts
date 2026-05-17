import { getNotionClient } from "@/lib/notion/client";

const NOTION_VERSION = "2022-06-28";

export async function queryDatabasePages(
  databaseId: string,
  filter?: Record<string, unknown>,
): Promise<Array<{ id: string; properties: Record<string, unknown> }>> {
  const token = process.env.NOTION_API_KEY?.trim();
  if (!token) {
    throw new Error("NOTION_API_KEY is not configured");
  }

  const results: Array<{ id: string; properties: Record<string, unknown> }> = [];
  let cursor: string | undefined;

  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(filter ? { filter } : {}),
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? `Notion query failed (${res.status})`);
    }

    const data = (await res.json()) as {
      results: Array<{ id: string; properties: Record<string, unknown> }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    results.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return results;
}

export function richTextPlain(props: Record<string, unknown>, name: string): string {
  const prop = props[name] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return prop?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? "";
}

export function titlePlain(props: Record<string, unknown>, name: string): string {
  const prop = props[name] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return prop?.title?.map((t) => t.plain_text ?? "").join("") ?? "";
}

export function selectName(props: Record<string, unknown>, name: string): string | null {
  const prop = props[name] as { select?: { name?: string } | null } | undefined;
  return prop?.select?.name ?? null;
}

export function dateStart(props: Record<string, unknown>, name: string): string | null {
  const prop = props[name] as { date?: { start?: string } | null } | undefined;
  return prop?.date?.start ?? null;
}

export function numberValue(props: Record<string, unknown>, name: string): number | null {
  const prop = props[name] as { number?: number | null } | undefined;
  return prop?.number ?? null;
}

export function checkboxValue(props: Record<string, unknown>, name: string): boolean {
  const prop = props[name] as { checkbox?: boolean } | undefined;
  return prop?.checkbox ?? false;
}

export async function findPageByIgId(
  databaseId: string,
  igId: string,
): Promise<string | null> {
  return findPageByRichTextProperty(databaseId, "IG ID", igId);
}

export async function findPageByEbId(
  databaseId: string,
  ebId: string,
): Promise<string | null> {
  return findPageByRichTextProperty(databaseId, "EB ID", ebId);
}

export async function findPageByRichTextProperty(
  databaseId: string,
  propertyName: string,
  value: string,
): Promise<string | null> {
  const pages = await queryDatabasePages(databaseId, {
    property: propertyName,
    rich_text: { equals: value },
  });
  return pages[0]?.id ?? null;
}

export async function updatePageProperties(
  pageId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: pageId,
    properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
  });
}
