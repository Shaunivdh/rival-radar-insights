# RivalRadar

Competitor intelligence SaaS — crawl competitor websites, extract signals, and surface actionable insights.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (database + auth)
- Cloudflare Browser Rendering (crawling)
- Inngest (background job queue)
- Anthropic API (AI scoring)
- Google Places API + SerpApi (reputation & SERP data)

## Getting started

### 1. Install dependencies

```sh
bun install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```sh
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings |
| `CF_ACCOUNT_ID` | Cloudflare dashboard → account menu |
| `CF_API_TOKEN` | Cloudflare → My Profile → API Tokens |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console |
| `SERP_API_KEY` | serpapi.com |
| `INNGEST_EVENT_KEY` | Inngest dashboard → your app |
| `INNGEST_SIGNING_KEY` | Inngest dashboard → your app |

### 3. Supabase: seed CF credentials

Cloudflare credentials are stored per-user in the `app_settings` table:

```sql
insert into app_settings (user_id, cf_account_id, cf_api_token)
values ('<your-user-id>', '<cf-account-id>', '<cf-api-token>');
```

### 4. Run locally

```sh
bun run dev:all
```

This starts Next.js and the Inngest dev server together in one terminal.

## How crawling works

1. A user clicks **Re-scan** on a competitor — calls `POST /api/crawl`
2. Inngest picks up the `crawl/business.scan` event and runs the crawl worker
3. The worker starts a Cloudflare crawl job, polls until complete, extracts signals, and saves to Supabase
4. A scheduled cron (`weeklyIncrementalCrawl`) runs every Monday 08:00 UTC to re-crawl all businesses automatically

Crawl limits:
- Initial: `maxDepth: 3`, `maxPages: 30`
- Incremental: `maxDepth: 2`, `maxPages: 10`

## Scripts

| Command | Description |
|---|---|
| `bun run dev:all` | Start Next.js + Inngest dev server |
| `bun run dev` | Start Next.js only |
| `bun run build` | Production build |
| `bun run lint` | Run ESLint |
