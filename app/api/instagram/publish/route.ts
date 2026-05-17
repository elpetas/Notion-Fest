/**
 * Publishes an Instagram post via the Graph API and marks the Notion row as Published.
 * POST /api/instagram/publish
 * Body: { notionPageId: string, caption: string, imageUrl: string }
 *
 * Two-step Graph API flow:
 *   1. POST /{userId}/media         — creates a media container
 *   2. POST /{userId}/media_publish — publishes the container
 *
 * Uses the Instagram Login (Business Login for Instagram) token flow.
 * Tokens are refreshed via graph.instagram.com/refresh_access_token — no
 * App ID or App Secret required, only the access token itself.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getNotionClient } from "@/lib/notion/client";

const GRAPH_VERSION = "v21.0";
const NOTION_VERSION = "2022-06-28";

const bodySchema = z.object({
  notionPageId: z.string().min(1),
  caption: z.string().min(1),
  imageUrl: z.string().url("imageUrl must be a valid HTTPS URL"),
});

interface GraphTokenResponse {
  access_token?: string;
  error?: { message: string };
}

interface GraphMediaResponse {
  id?: string;
  error?: { message: string };
}

/**
 * Refresh a long-lived Instagram Login token.
 * Instagram Login tokens are refreshed via graph.instagram.com using only
 * the token itself — no App ID or App Secret required.
 * Tokens are valid for 60 days and can be refreshed any time before expiry.
 */
async function tryRefreshToken(
  currentToken: string,
): Promise<{ token: string; refreshed: boolean }> {
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", currentToken);

    const res = await fetch(url.toString());
    const data = (await res.json()) as GraphTokenResponse;

    if (!res.ok || !data.access_token) {
      return { token: currentToken, refreshed: false };
    }

    const refreshed = data.access_token !== currentToken;
    return { token: data.access_token, refreshed };
  } catch {
    return { token: currentToken, refreshed: false };
  }
}

export async function POST(req: Request): Promise<Response> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const userId = process.env.INSTAGRAM_USER_ID?.trim();

  if (!accessToken || !userId) {
    return NextResponse.json(
      { error: "INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID must be configured" },
      { status: 500 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { notionPageId, caption, imageUrl } = parsed.data;

  // Validate imageUrl is HTTPS (Instagram requirement)
  if (!imageUrl.startsWith("https://")) {
    return NextResponse.json(
      { error: "imageUrl must be a publicly accessible HTTPS URL — Instagram does not accept local or HTTP URLs." },
      { status: 400 },
    );
  }

  // Attempt token refresh on every publish call (cheap, keeps the token alive)
  let activeToken = accessToken;
  let newToken: string | null = null;

  const refreshResult = await tryRefreshToken(accessToken);
  activeToken = refreshResult.token;
  if (refreshResult.refreshed) newToken = refreshResult.token;

  // Step 1: Create media container
  const containerUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${userId}/media`);
  containerUrl.searchParams.set("image_url", imageUrl);
  containerUrl.searchParams.set("caption", caption);
  containerUrl.searchParams.set("access_token", activeToken);

  const containerRes = await fetch(containerUrl.toString(), { method: "POST" });
  const containerData = (await containerRes.json()) as GraphMediaResponse;

  if (!containerRes.ok || !containerData.id) {
    const msg = containerData.error?.message ?? `Graph API error ${containerRes.status}`;
    return NextResponse.json({ error: `Failed to create media container: ${msg}` }, { status: 502 });
  }

  const containerId = containerData.id;

  // Step 2: Publish the container
  const publishUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${userId}/media_publish`);
  publishUrl.searchParams.set("creation_id", containerId);
  publishUrl.searchParams.set("access_token", activeToken);

  const publishRes = await fetch(publishUrl.toString(), { method: "POST" });
  const publishData = (await publishRes.json()) as GraphMediaResponse;

  if (!publishRes.ok || !publishData.id) {
    const msg = publishData.error?.message ?? `Graph API error ${publishRes.status}`;
    return NextResponse.json({ error: `Failed to publish media: ${msg}` }, { status: 502 });
  }

  const postId = publishData.id;

  // Step 3: Mark the Notion row as Published
  const notionToken = process.env.NOTION_API_KEY?.trim();
  if (notionToken) {
    await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          Published: { checkbox: true },
          "IG Post ID": {
            rich_text: [{ type: "text", text: { content: postId } }],
          },
          Notes: {
            rich_text: [
              {
                type: "text",
                text: { content: `Published via Instagram API · Post ID: ${postId}` },
              },
            ],
          },
        },
      }),
    });
  }

  // Also update via the SDK client as a fallback (if raw fetch token not set)
  if (!notionToken) {
    const notion = getNotionClient();
    await notion.pages.update({
      page_id: notionPageId,
      properties: {
        Published: { checkbox: true },
        "IG Post ID": {
          rich_text: [{ type: "text", text: { content: postId } }],
        },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    postId,
    containerId,
    ...(newToken ? { newToken, tokenRefreshed: true } : {}),
  });
}
