import { Worker, j } from "@notionhq/workers";

const worker = new Worker();
export default worker;

worker.tool("sayHello", {
  title: "Say Hello",
  description: "Returns a friendly greeting from the worker",
  schema: j.object({
    name: j.string(),
  }),
  hints: { readOnlyHint: true },
  execute: (input) => `hello from worker, ${input.name}!`,
});

worker.tool("enrichArtistRoster", {
  title: "Enrich Artist Roster",
  description:
    "Searches Spotify for an artist by name and returns their follower count, popularity score, and top genres as structured JSON. Use this to enrich the DJ / Artist roster before outreach.",
  schema: j.object({
    artistName: j.string(),
  }),
  hints: { readOnlyHint: true },
  execute: async (input) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return JSON.stringify({ error: "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not configured on this worker" });
    }

    // Get client_credentials token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) {
      return JSON.stringify({ error: `Spotify token error ${tokenRes.status}` });
    }
    const tokenData = (await tokenRes.json()) as { access_token: string };

    // Search for the artist
    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", input.artistName);
    searchUrl.searchParams.set("type", "artist");
    searchUrl.searchParams.set("limit", "1");

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const searchData = (await searchRes.json()) as {
      artists?: {
        items: Array<{
          name: string;
          followers: { total: number };
          popularity: number;
          genres: string[];
          external_urls: { spotify: string };
        }>;
      };
      error?: { message: string };
    };

    if (!searchRes.ok) {
      return JSON.stringify({ error: searchData.error?.message ?? `Spotify search error ${searchRes.status}` });
    }

    const artist = searchData.artists?.items[0];
    if (!artist) {
      return JSON.stringify({ error: `No Spotify artist found for "${input.artistName}"` });
    }

    return JSON.stringify({
      name: artist.name,
      followers: artist.followers.total,
      popularity: artist.popularity,
      genres: artist.genres.slice(0, 5),
      spotifyUrl: artist.external_urls.spotify,
    });
  },
});

worker.tool("publishInstagramPost", {
  title: "Publish Instagram Post",
  description:
    "Publishes a photo post to an Instagram Business account via the Graph API (Instagram Login / Business Login flow). Requires INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, and a publicly accessible HTTPS image URL. Returns the Instagram post ID on success.",
  schema: j.object({
    caption: j.string(),
    imageUrl: j.string(),
  }),
  hints: { readOnlyHint: false },
  execute: async (input) => {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    const userId = process.env.INSTAGRAM_USER_ID;
    if (!token || !userId) {
      return JSON.stringify({ error: "INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID must be configured on this worker" });
    }

    const GRAPH = "https://graph.facebook.com/v21.0";

    // Step 1: Create media container
    const containerUrl = new URL(`${GRAPH}/${userId}/media`);
    containerUrl.searchParams.set("image_url", input.imageUrl);
    containerUrl.searchParams.set("caption", input.caption);
    containerUrl.searchParams.set("access_token", token);

    const containerRes = await fetch(containerUrl.toString(), { method: "POST" });
    const containerData = (await containerRes.json()) as { id?: string; error?: { message: string } };

    if (!containerRes.ok || !containerData.id) {
      return JSON.stringify({ error: containerData.error?.message ?? `Container creation failed (${containerRes.status})` });
    }

    // Step 2: Publish the container
    const publishUrl = new URL(`${GRAPH}/${userId}/media_publish`);
    publishUrl.searchParams.set("creation_id", containerData.id);
    publishUrl.searchParams.set("access_token", token);

    const publishRes = await fetch(publishUrl.toString(), { method: "POST" });
    const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } };

    if (!publishRes.ok || !publishData.id) {
      return JSON.stringify({ error: publishData.error?.message ?? `Publish failed (${publishRes.status})` });
    }

    return JSON.stringify({ ok: true, postId: publishData.id });
  },
});

worker.tool("syncEventbriteTickets", {
  title: "Sync Eventbrite Tickets",
  description:
    "Fetches ticket tier data from an Eventbrite event and returns it as structured JSON — name, price, total capacity, and units sold for each tier.",
  schema: j.object({
    eventId: j.string(),
  }),
  hints: { readOnlyHint: true },
  execute: async (input) => {
    const key = process.env.EVENTBRITE_API_KEY;
    if (!key) {
      return JSON.stringify({ error: "EVENTBRITE_API_KEY is not configured on this worker" });
    }

    const res = await fetch(
      `https://www.eventbriteapi.com/v3/events/${input.eventId}/ticket_classes/`,
      { headers: { Authorization: `Bearer ${key}` } },
    );

    const data = (await res.json()) as {
      ticket_classes?: Array<{
        name: string;
        free: boolean;
        cost?: { major_value: string };
        quantity_total: number;
        quantity_sold: number;
      }>;
      error_description?: string;
    };

    if (!res.ok) {
      return JSON.stringify({ error: data.error_description ?? `Eventbrite error ${res.status}` });
    }

    const tiers = (data.ticket_classes ?? []).map((t) => ({
      name: t.name,
      price: t.free ? 0 : parseFloat(t.cost?.major_value ?? "0"),
      capacity: t.quantity_total,
      sold: t.quantity_sold,
    }));

    return JSON.stringify(tiers);
  },
});
