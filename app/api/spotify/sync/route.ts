/**
 * Syncs selected Spotify artists into the Notion "DJ / Artist roster" database.
 * POST /api/spotify/sync
 * Body: { artists: SpotifyArtist[], notionDbId: string }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { getNotionClient } from "@/lib/notion/client";

const artistSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  followers: z.number(),
  popularity: z.number(),
  genres: z.array(z.string()),
  imageUrl: z.string().nullable(),
  spotifyUrl: z.string(),
});

const rosterStatusSchema = z.enum(["wishlist", "pending", "booked"]);

const bodySchema = z.object({
  artists: z.array(artistSchema).min(1),
  notionDbId: z.string().min(1),
  /** Applied to every artist when status is not set per row */
  defaultStatus: rosterStatusSchema.optional(),
  /** Optional per-artist status keyed by Spotify artist id */
  statusByArtistId: z.record(z.string(), rosterStatusSchema).optional(),
});

function notionStatusName(status: z.infer<typeof rosterStatusSchema>): string {
  switch (status) {
    case "booked":
      return "Confirmed";
    case "pending":
      return "Contacted";
    default:
      return "Wishlist";
  }
}

export async function POST(req: Request): Promise<Response> {
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

  const { artists, notionDbId, defaultStatus, statusByArtistId } = parsed.data;
  const notion = getNotionClient();

  const created = await Promise.all(
    artists.map((artist) => {
      const followersText = artist.followers.toLocaleString("en-US");
      const genreText = artist.genres.join(", ");
      const notesContent =
        [
          `Followers: ${followersText}`,
          genreText ? `Genres: ${genreText}` : null,
          `Popularity score: ${artist.popularity}/100`,
          `Spotify: ${artist.spotifyUrl}`,
        ]
          .filter(Boolean)
          .join(" · ");

      const bookingStatus =
        statusByArtistId?.[artist.id] ?? defaultStatus ?? "wishlist";

      return notion.pages.create({
        parent: { type: "database_id", database_id: notionDbId },
        properties: {
          Artist: {
            title: [{ type: "text", text: { content: artist.name } }],
          },
          "Set notes": {
            rich_text: [{ type: "text", text: { content: notesContent } }],
          },
          Status: {
            select: { name: notionStatusName(bookingStatus) },
          },
        },
      });
    }),
  );

  return NextResponse.json({
    synced: created.length,
    artists: artists.map((a) => ({ name: a.name, followers: a.followers })),
  });
}
