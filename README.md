# Notion Fest

Next.js app that chats with Claude (Sonnet 4) to confirm festival **budget**, **genre**, **dates**, and **vibe**, then creates a **Festival hub** page plus eight Notion databases under a parent page you choose.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Vercel AI SDK** + **Anthropic** (`claude-sonnet-4-20250514`)
- **Notion API** (`@notionhq/client`)
- **Tailwind CSS 4** + **shadcn/ui**

## Run locally

```bash
npm install
cp .env.local.example .env.local
# edit .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Start planning** → `/chat`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key for the chat route |
| `NOTION_API_KEY` | Notion internal integration secret |
| `NOTION_PAGE_ID` | UUID of the page where the hub will be created (integration must have access) |

## Folder structure

- `app/page.tsx` — landing
- `app/chat/page.tsx` — client chat + “Send to Notion”
- `app/api/chat/route.ts` — streaming agent + `confirmFestivalSettings` tool
- `app/api/notion/setup/route.ts` — creates Notion hub + databases
- `lib/ai/festival-agent.ts` — system prompt + tool
- `lib/notion/scaffold.ts` — Notion database layout
- `types/festival.ts` — shared types

## Notion setup (demo)

1. Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and copy the secret → `NOTION_API_KEY`.
2. Create or pick a **parent page** in your workspace and connect the integration to that page.
3. Copy the page ID from the page URL → `NOTION_PAGE_ID`.

The app creates a child **Festival hub** page and these databases: Venues, Flyer designs, Ad copies, Audience, Social schedule, DJ roster, Ticket tiers, Merchandise & logistics checklist.

## Scripts

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — ESLint
