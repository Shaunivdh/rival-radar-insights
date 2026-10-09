# Issue Tracker & Spec Brief

## Project Overview

**Scoutly** is a local competitor intelligence SaaS that scores businesses (primary + up to 5 competitors) across reputation, local SEO visibility, website quality, Google Business Profile completeness, AI visibility, and review velocity.

## Core Features Spec

### Crawling System

- Queue-based orchestration with multi-stage processing
- All crawls **must** use `render: true` + `gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 }`
- Static HTML causes incomplete pages; JS rendering is mandatory
- Incremental crawl re-fetches full pages with JS rendering
- Cache written AFTER enrichment, not before

### AI Module (`src/services/ai/`)

- All calls go through `callLLMRaw` in `client.ts`
- Outputs via JSON schema (`output_config.format`)
- Stop reason `max_tokens` throws `TruncatedOutputError` — logged as `errorType: 'truncated'`
- Priority actions must cite resolvable `evidence` paths; unresolvable paths drop the action
- No dashes (em, en, arrows) in AI-generated text (UK English)
- Models: `AI_MODEL_FAST` (Haiku 4.5), `AI_MODEL_SMART` (Sonnet 5)

### UI & Styling

- Tailwind only; no new UI libraries
- Fonts: **DM Sans** (body), **Montserrat** (headings, weights 800/900)
- Primary: violet `hsl(262 60% 58%)`; Accent: orange `hsl(32 95% 55%)`
- Theme tokens in `src/app/globals.css`; neumorphic surfaces (`.card-surface` / `.neu`)
- No dashes in user-readable copy; code comments are exempt

### Data & Validation

- Health scores are deterministic (`src/services/scores.ts`) — no AI
- Action-plan generation via `src/api/regenerate-actions` (metered per user)
- Change alerts use oscillation suppression + confirmation re-crawl to prevent false positives

## Known Issues & Gotchas

- Crawl queue deadlock can occur if Inngest concurrency saturates; `/api/regenerate-actions` is recovery route
- `next dev` hangs if repo is in iCloud-synced ~/Documents (blocking file reads)
- Change alerts may still fire on trivial real changes (no materiality threshold yet)

## Common Mistakes

- Using static HTML crawl (`render: false`) instead of JS rendering
- Adding `modifiedSince` to crawl params (causes Cloudflare hangs; intentionally removed)
- Exposing API keys to frontend; all external calls server-side only
- Inventing APIs, DB fields, or services that don't exist
- Dashes in user-facing strings (copy, LLM output, prompts)
