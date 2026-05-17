/**
 * Live artist search using the Spotify Web API (client_credentials — no user login needed).
 * GET /api/spotify/search?q=<query>
 */

import { NextResponse } from "next/server";

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyArtistObject {
  id: string;
  name: string;
  followers: { total: number };
  popularity: number;
  genres: string[];
  images: Array<{ url: string; width: number; height: number }>;
  external_urls: { spotify: string };
}

interface SpotifySearchResponse {
  artists?: {
    items: SpotifyArtistObject[];
  };
  error?: { message: string; status: number };
}

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Spotify token error ${res.status}`);
  }

  const data = (await res.json()) as SpotifyTokenResponse;
  return data.access_token;
}

export async function GET(req: Request): Promise<Response> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return NextResponse.json({ artists: [] });
  }

  let token: string;
  try {
    token = await getSpotifyToken(clientId, clientSecret);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to authenticate with Spotify" },
      { status: 502 },
    );
  }

  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("q", q);
  searchUrl.searchParams.set("type", "artist");
  searchUrl.searchParams.set("limit", "8");

  const res = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await res.json()) as SpotifySearchResponse;

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error?.message ?? `Spotify search error ${res.status}` },
      { status: 502 },
    );
  }

  const artists = (data.artists?.items ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    followers: a.followers.total,
    popularity: a.popularity,
    genres: a.genres.slice(0, 3),
    imageUrl: a.images.find((img) => img.width <= 300)?.url ?? a.images[0]?.url ?? null,
    spotifyUrl: a.external_urls.spotify,
  }));

  return NextResponse.json({ artists });
}
