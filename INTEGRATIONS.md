# Notion Fest — Integration Roadmap

Each section picks the easiest service per category, lists the env vars needed,
which Notion database it targets, and what the API route + Worker tool should do.
Eventbrite (ticketing) is already implemented as the reference pattern.

---

## ✅ Done — Ticketing: Eventbrite

**Env:** `EVENTBRITE_API_KEY`  
**Notion DB:** Ticket tiers  
**Route:** `POST /api/eventbrite/sync`  
**What it does:** Pulls ticket classes (name, price, capacity, sold) from an event and upserts rows into the Ticket tiers DB.

---

## 2. Artist / Booking — Spotify

**Why easiest:** Free API, no app approval, client_credentials flow works without a user login. Useful for enriching the DJ roster with real follower/popularity data before outreach.

**Env vars to add:**
```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

**How to get them:**
1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app (any name/description)
3. Copy Client ID and Client Secret

**Notion DB:** DJ / Artist roster  
**Route:** `POST /api/spotify/enrich`  
**Body:** `{ notionDbId: string }` — reads Artist name from each row  
**What it does:**
- Gets a client_credentials access token (`POST https://accounts.spotify.com/api/token`)
- For each artist in the DB: `GET https://api.spotify.com/v1/search?q={name}&type=artist&limit=1`
- Writes back: monthly listeners / followers into a `Notes` field update

**Worker tool:** `enrichArtistRoster` — takes `artistName`, returns Spotify follower count + top genres as JSON

---

## 3. Marketing / Email — Mailchimp

**Why easiest:** REST API with simple API key auth, no OAuth. Perfect for blasting ticket announcements to a list.

**Env vars to add:**
```
MAILCHIMP_API_KEY=
MAILCHIMP_SERVER_PREFIX=
MAILCHIMP_LIST_ID=
```

**How to get them:**
1. Create a free Mailchimp account at [mailchimp.com](https://mailchimp.com)
2. Account > Extras > API Keys > Create A Key
3. Server prefix is the part after `-` in your API key (e.g. `us21`)
4. Audience > Settings > Audience name and defaults → find the Audience ID

**Notion DB:** Social schedule  
**Route:** `POST /api/mailchimp/campaign`  
**Body:** `{ subject: string, body: string, listId?: string }`  
**What it does:**
- Creates a campaign (`POST https://us{prefix}.api.mailchimp.com/3.0/campaigns`)
- Sets content (`PUT .../campaigns/{id}/content`)
- Sends it (`POST .../campaigns/{id}/actions/send`)
- Updates the matching Social schedule row: ticks `Published` checkbox

**Worker tool:** `sendEmailCampaign` — takes `subject` + `body`, fires the campaign, returns campaign ID

---

## 4. Payments / Sponsors — Stripe

**Why easiest:** Best-in-class test mode, no real money needed for demo, instant approval. Models sponsor invoicing and budget actuals.

**Env vars to add:**
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

**How to get them:**
1. Create account at [stripe.com](https://stripe.com) (no business verification needed for test mode)
2. Dashboard > Developers > API Keys → copy the `sk_test_...` key
3. Dashboard > Developers > Webhooks → add endpoint `/api/stripe/webhook`, copy signing secret

**Notion DB:** Budget tracker  
**Routes:**
- `POST /api/stripe/invoice` — creates a Stripe invoice for a sponsor, returns payment link
- `POST /api/stripe/webhook` — listens for `invoice.paid` events, updates the matching Budget tracker row: sets `Actual` amount and ticks `Paid` checkbox

**What it does end-to-end:**  
Organizer clicks "Invoice sponsor" in the UI → Stripe invoice is created and emailed to the sponsor → when they pay, the webhook fires → Budget tracker row auto-updates to reflect real spend.

**Worker tool:** `createSponsorInvoice` — takes `sponsorEmail`, `amount`, `description`, returns the Stripe-hosted invoice URL

---

## 5. Comms / Day-of — Slack

**Why easiest:** Incoming webhooks are a single URL, zero auth setup, and you can send rich formatted messages in seconds.

**Env vars to add:**
```
SLACK_WEBHOOK_URL=
```

**How to get it:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps) > Create New App > From scratch
2. Features > Incoming Webhooks > Activate > Add New Webhook to Workspace
3. Pick a channel (e.g. `#festival-ops`) and copy the webhook URL

**Notion DB:** Run of show + Staff & volunteers  
**Route:** `POST /api/slack/notify`  
**Body:** `{ message: string, channel?: string }`  
**What it does:**
- Posts a message to the Slack channel via `POST {SLACK_WEBHOOK_URL}`
- Called automatically when: a Run of show item's time arrives (cron), or a Staff row is created (notify them of their shift details)

**Worker tool:** `postSlackUpdate` — takes `message`, fires the webhook, returns `ok`

---

## Pattern to follow in each new chat

Every integration follows the same shape as Eventbrite:

```
1. Add env vars to .env and .env.example
2. Create app/api/{service}/route.ts
   - Validate env vars
   - Call external API
   - Read/write Notion via getNotionClient() or raw fetch
   - Return clean JSON
3. Add a Worker tool in notion-worker/src/index.ts
4. Pass new env var in app/api/deploy-notion-worker/route.ts
5. Add a card to app/preview/page.tsx (or a dedicated /integrations page)
```

The `databaseIds` map on `NotionSetupResponse` gives you the raw Notion DB UUID
for any of the 16 databases without needing to hard-code IDs.
