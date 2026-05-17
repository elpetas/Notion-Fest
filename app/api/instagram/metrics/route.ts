/**
 * Fetches all published posts for the authenticated Instagram Business account
 * along with their engagement metrics (likes, comments, impressions, reach, saves).
 * GET /api/instagram/metrics
 *
 * Uses Instagram Login (Business Login for Instagram) token flow.
 * Insights are fetched in parallel for each post.
 */

import { NextResponse } from "next/server";

const GRAPH = "https://graph.facebook.com/v21.0";

interface MediaItem {
  id: string;
  caption?: string;
  media_type: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  permalink: string;
}

interface MediaResponse {
  data?: MediaItem[];
  error?: { message: string };
  paging?: { next?: string };
}

interface InsightValue {
  value: number;
}

interface InsightItem {
  name: string;
  values?: InsightValue[];
  total_value?: { value: number };
}

interface InsightsResponse {
  data?: InsightItem[];
  error?: { message: string };
}

async function fetchInsights(
  mediaId: string,
  token: string,
): Promise<{ impressions: number; reach: number; saved: number }> {
  try {
    const url = new URL(`${GRAPH}/${mediaId}/insights`);
    url.searchParams.set("metric", "impressions,reach,saved");
    url.searchParams.set("access_token", token);

    const res = await fetch(url.toString());
    if (!res.ok) return { impressions: 0, reach: 0, saved: 0 };

    const data = (await res.json()) as InsightsResponse;
    const metrics: Record<string, number> = {};

    for (const item of data.data ?? []) {
      // Insights API returns value in different shapes depending on media type
      const val =
        item.total_value?.value ??
        item.values?.[0]?.value ??
        0;
      metrics[item.name] = val;
    }

    return {
      impressions: metrics["impressions"] ?? 0,
      reach: metrics["reach"] ?? 0,
      saved: metrics["saved"] ?? 0,
    };
  } catch {
    return { impressions: 0, reach: 0, saved: 0 };
  }
}

export async function GET(): Promise<Response> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const userId = process.env.INSTAGRAM_USER_ID?.trim();

  if (!token || !userId) {
    return NextResponse.json(
      { error: "INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID must be configured" },
      { status: 500 },
    );
  }

  // Fetch media list — up to 25 most recent posts
  const mediaUrl = new URL(`${GRAPH}/${userId}/media`);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,timestamp,like_count,comments_count,permalink",
  );
  mediaUrl.searchParams.set("limit", "25");
  mediaUrl.searchParams.set("access_token", token);

  const mediaRes = await fetch(mediaUrl.toString());
  const mediaData = (await mediaRes.json()) as MediaResponse;

  if (!mediaRes.ok) {
    return NextResponse.json(
      { error: mediaData.error?.message ?? `Graph API error ${mediaRes.status}` },
      { status: 502 },
    );
  }

  const items = mediaData.data ?? [];

  // Fetch insights for each post in parallel
  const posts = await Promise.all(
    items.map(async (item) => {
      const insights = await fetchInsights(item.id, token);
      return {
        id: item.id,
        caption: item.caption ?? "",
        mediaType: item.media_type,
        timestamp: item.timestamp,
        permalink: item.permalink,
        likes: item.like_count,
        comments: item.comments_count,
        impressions: insights.impressions,
        reach: insights.reach,
        saved: insights.saved,
      };
    }),
  );

  return NextResponse.json({ posts });
}
