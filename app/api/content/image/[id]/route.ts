/**
 * Serves cached generated images (public HTTPS URL for Instagram publish flow).
 * GET /api/content/image/[id]
 */

import { NextResponse } from "next/server";

import { getCachedImage } from "@/lib/content/image-cache";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const cached = getCachedImage(id);

  if (!cached) {
    return NextResponse.json({ error: "Image not found or expired" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(cached.buffer), {
    headers: {
      "Content-Type": cached.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
