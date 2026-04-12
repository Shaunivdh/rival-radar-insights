# Claude Instructions for RivalRadar

You are assisting with development of a Next.js + TypeScript SaaS called RivalRadar.

Your goal is to minimize token usage and avoid unnecessary large responses.

## Response Rules

* Keep responses concise.
* Prefer bullet points over paragraphs.
* Never explain obvious code.
* Do not repeat code unless it changes.
* Only output modified sections of files when editing.
* If a change affects multiple files, list them first before generating code.

## File Reading Rules

* Never read the entire repository unless explicitly asked.
* Only read files required to complete the task.
* Prefer reading a single file at a time.
* Avoid reading files larger than 500 lines unless necessary.

## Code Generation Rules

* Modify existing code instead of regenerating files.
* Avoid rewriting entire components.
* Do not generate placeholder boilerplate unless requested.
* Follow existing project patterns and folder structure.

## RivalRadar Architecture

Stack:

* Next.js (App Router)
* TypeScript
* Zustand
* Tailwind
* Supabase (database)
* Anthropic API (AI analysis)
* Cloudflare Browser Rendering
* Google Places API
* SerpApi

Key rule:

All external API calls must be server-side.

Never expose API keys to the frontend.

## Crawling Constraints

Each project includes:

* 1 primary business
* up to 5 competitors

Crawl limits:

Initial scan

* maxDepth: 3
* maxPages: controlled by `CRAWL_MAX_PAGES` env var (default 15)

Incremental scan

* maxDepth: 2
* maxPages: 10
* use modifiedSince timestamp

Always design crawl orchestration to be queue-based.

Crawl implementation rules:

* `CrawlCredentials` is exported from `@/services/crawl` — do not redeclare it elsewhere.
* `startCrawl` serializes only `render`, `limit` (from `maxPages`), `jsonOptions`, and `modifiedSince` to the CF API body — CF rejects `maxDepth` and `outputFormats` (unrecognized keys). CF returns `html` by default; `json` is only populated when `jsonOptions.prompt` is set.
* `crawl_jobs` rows must include `cf_job_id` (the CF job ID returned by `startCrawl`).
* Daily crawl limit (`MAX_DAILY_CRAWLS`) counts only `status IN ('running', 'completed')` rows — not failed/cancelled.
* Cache (`saveToCache`) is written after priority page enrichment, not before — so cached results always include multi-page data.

Multi-page enrichment (post-crawl):

* `extractPriorityLinks` and `crawlSinglePage` are exported from `@/services/crawl` — use them for sub-page crawling.
* After the root CF crawl completes, extract internal links from `pages[0].html` using `extractPriorityLinks`.
* Prioritise URLs containing: `services`, `blog`, `pricing`, `about`, `treatments`, `contact`.
* Crawl up to `CRAWL_PRIORITY_PAGES` additional pages (default 5) via `crawlSinglePage`, capped so total pages ≤ `CRAWL_MAX_PAGES` (default 15).
* `crawlSinglePage` launches a separate CF job per URL and polls up to 60s — running 5 in parallel is the expected usage.
* If `pages[0].html` is empty, log a warning — the multi-page step will silently skip and only root signals are extracted.
* Merged pages are passed to `extractSignals` as a single `RawCrawlResult` — signals are always merged across all pages into one `extracted_signals` row.

## AI Usage Rules

Claude API is used only for:

1. generateHealthScore
2. generatePriorityActions
3. generateChangeSummary

AI responses must:

* return valid JSON only
* avoid verbose explanations
* stay under 200 tokens

Prefer deterministic scoring logic where possible to reduce AI calls.

## Token Efficiency Guidelines

Before generating code:

1. Check if existing code can be reused
2. Avoid large refactors unless requested
3. Suggest minimal changes first

When explaining something:

* maximum 5 bullet points
* no long essays

## UI Rules

* Use existing design system
* Tailwind only
* Inter font
* RivalRadar purple: #5B4EE8
* Avoid new UI libraries

## When unsure

Ask a clarification question instead of guessing.

Do not invent APIs or data structures that are not defined in the project.
Return JSON under 150 tokens.
Do not refactor code unless explicitly requested.
Prefer patch-style edits instead of full file rewrites.
