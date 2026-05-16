"use server";

function parseNotionPageId(input: string): string | null {
  const trimmed = input.trim();
  // Plain UUID (with or without dashes)
  const uuidRe = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  if (uuidRe.test(trimmed)) {
    return trimmed.replace(/-/g, "");
  }
  // Notion URL: last path segment before any query/hash, strip dashes
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    // Segment may be "Page-Title-<id>" — id is the last 32 hex chars
    const hexId = last.replace(/-/g, "").slice(-32);
    if (/^[0-9a-f]{32}$/i.test(hexId)) {
      return hexId;
    }
  } catch {
    // not a URL
  }
  return null;
}

export type CreatePageResult =
  | { ok: true; url: string; title: string }
  | { ok: false; error: string };

export async function createNotionPage(
  text: string,
  parentUrl: string,
): Promise<CreatePageResult> {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) {
    return { ok: false, error: "NOTION_API_TOKEN is not configured." };
  }

  const pageId = parseNotionPageId(parentUrl);
  if (!pageId) {
    return {
      ok: false,
      error:
        "Could not parse a Notion page ID from the URL you provided. Paste the full page URL from Notion.",
    };
  }

  const title = text.trim() || "Untitled";

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { type: "page_id", page_id: pageId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title } }],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: `hello from worker — ${title}` },
              },
            ],
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { message?: string }).message ??
      `Notion API error ${res.status}`;
    return { ok: false, error: msg };
  }

  const page = (await res.json()) as { url: string };
  return { ok: true, url: page.url, title };
}
