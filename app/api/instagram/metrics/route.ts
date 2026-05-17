/**
 * Fetches recent Instagram posts with engagement metrics.
 * GET /api/instagram/metrics
 */

import { NextResponse } from "next/server";

import { getInstagramCredentials } from "@/lib/instagram/config";
import { fetchPostsWithInsights } from "@/lib/instagram/graph";

export async function GET(): Promise<Response> {
  try {
    getInstagramCredentials();
    const posts = await fetchPostsWithInsights(25);
    return NextResponse.json({ posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load metrics";
    const status = message.includes("must be configured") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
