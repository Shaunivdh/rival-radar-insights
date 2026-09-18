# CLAUDE.md — RivalRadar

You are assisting with a Next.js + TypeScript SaaS called **RivalRadar**.

Your priority is **correctness, minimal token usage, and small safe diffs**.

---

## 1. Core Behaviour

- Be concise
- Prefer bullet points
- Only output code changes (diffs / modified sections)
- Do NOT rewrite full files unless explicitly requested
- Do NOT explain code unless asked
- Ask clarifying questions instead of guessing
- When making design and layout changes do not change any crawl logic. Or notify me if this is needed

---

## 2. Safety Rules

- All external API calls must be server-side only
- Never expose API keys to the frontend
- Do not invent APIs, DB fields, or services
- Use only existing project patterns and utilities

---

## 3. Code Rules

- Prefer minimal edits over refactors
- Reuse existing logic whenever possible
- Follow current folder structure
- Avoid boilerplate unless explicitly requested
- Maintain TypeScript strictness

---

## 4. File Access Rules

- Only open files required for the task
- Do not scan the full repository unless explicitly asked
- Prefer one file at a time
- Avoid reading large files (>500 lines) unless necessary

---

## 5. AI Usage (Anthropic)

All calls live in `src/services/ai.ts` and go through `callLLMRaw`. Models come from
`AI_MODEL_FAST` (default Haiku 4.5) and `AI_MODEL_SMART` (default Sonnet 5).

| Function                                       | Model | max_tokens       | Output                                   |
| ---------------------------------------------- | ----- | ---------------- | ---------------------------------------- |
| `extractPageSignals` (per page)                | FAST  | 4096             | `EXTRACTION_SCHEMA`                      |
| `generateReviewSentiment`                      | FAST  | 512              | `SENTIMENT_SCHEMA`                       |
| `checkAIVisibility` (5 queries + web search)   | SMART | 1000 per query   | free text, then mention extraction       |
| `extractMentionedBusinesses`                   | FAST  | 1024             | `MENTIONED_BUSINESSES_SCHEMA`            |
| `generatePriorityActions` / `…WithHistory`     | SMART | 900 × open slots | `PRIORITY_ACTIONS_*_SCHEMA` (+ evidence) |
| `validateActionsHybrid` (fact-checker patches) | SMART | 1500             | `VALIDATION_PATCHES_SCHEMA`              |
| `generateChangeSummary`                        | FAST  | 1024             | `CHANGE_SUMMARY_SCHEMA`                  |

Health scores are deterministic (`src/services/scores.ts`) — no AI.

### Requirements:

- Every call passes a JSON schema via `output_config.format` (`src/services/aiSchemas.ts`); parse the text block directly, never strip fences or regex for brackets
- `stop_reason === 'max_tokens'` throws `TruncatedOutputError` and is logged as `errorType: 'truncated'` — never parse a truncated body
- LLM priority actions must cite `evidence` paths; unresolvable paths drop the action, mismatched values are flagged to the fact-checker
- Prefer deterministic logic (templates, regex parsers) over AI whenever possible
- No explanations in AI outputs

---

## 6. Crawling System (@crawl-rules)

**Architecture:** Queue-based orchestration with multi-stage processing

### Key Principles

- Initial crawl: Full page + `gotoOptions: { waitUntil: 'networkidle0' }`
- Incremental crawl: ALSO full page with JS rendering (NOT static HTML)
- Multi-page enrichment: Happens AFTER root crawl completes
- Cache: Written AFTER enrichment, not before

### Critical: Rendering Requirements

- **ALL crawls must use `render: true`** — modern educational/business sites are JavaScript-heavy (React, Vue, Angular SPAs)
- **ALL crawls must use `gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 }`** — ensures JavaScript has time to render before returning HTML
- Static HTML (`render: false`) causes empty/incomplete pages (~176 chars) with missing signals
- The `modifiedSince` parameter causes Cloudflare hangs; it is intentionally removed and should NOT be re-added

### Crawl Functions

- `startCrawl()` — Initial full crawl with JS rendering
- `startIncrementalCrawl()` — Re-crawl with JS rendering (NOT static HTML)
- `crawlSinglePage()` — Priority page crawl with JS rendering
- `fetchPageDirect()` — Fallback HTTP fetch (no JS, used only when crawl fails)

### Detection & Recovery

- Empty HTML (<500 chars) or challenge pages trigger automatic retry with `waitUntil: 'networkidle0'` + 30s timeout
- Challenge/popup overlay patterns are stripped from HTML before parsing
- Unusable pages are logged with diagnostics (title, h1, link count, popup signals)
- Direct fetch fallback used only when all render attempts fail

### Data Quality Signals

Do NOT optimize crawl performance at the expense of data quality. A 2-3 second increase in crawl time is acceptable to get complete, usable HTML with all signals (h1 tags, title, links, schema markup).

---

## 7. UI Rules

- Tailwind only
- Fonts: **Inter** for body, **Space Grotesk** for headings (`h1`–`h6`)
- Primary brand color: violet `hsl(262 60% 58%)` (~`#8354D4`); accent: orange `hsl(32 95% 55%)` (~`#F9941F`)
- Theme is **token-driven** — all colors/gradients/shadows live in `src/app/globals.css` `:root`. Change tokens, not per-component hex. Tailwind color utilities resolve from these tokens.
- Surfaces are **neumorphic**: `.card-surface` / `.neu` use the soft `--neu-shadow`, `rounded-2xl` (`--radius: 1rem`), sitting on the `--gradient-canvas` app background
- Do not introduce new UI libraries

### Design Skills (tasteskill.dev)

External `SKILL.md` design skills from `github.com/Leonxlnx/taste-skill`, used to guide UI/design work.

Install (writes a `SKILL.md` into the project; no plugin/config needed):

```
npx skills add https://github.com/Leonxlnx/taste-skill --skill "<install-name>"
```

Approved for this repo (data-heavy B2B analytics dashboard):

- `design-taste-frontend` — v2 base engine; infers design direction + anti-slop checks (install first)
- `minimalist-ui` — Notion/Linear editorial UI; **primary fit** for scores/tables/actions
- `redesign-existing-projects` — audits + fixes existing UIs (we are improving, not greenfield)
- `high-end-visual-design` — calm/premium "soft" aesthetic; secondary, layer on top

Avoid: `industrial-brutalist-ui` (wrong tone for trust-oriented B2B), `gpt-taste` (GPT/Codex-tuned).

Constraints when applying these skills — they OVERRIDE any skill output:

- Tailwind only; **no new UI libraries or dependencies**
- Keep the `globals.css` theme tokens (Inter body / Space Grotesk headings, violet `hsl(262 60% 58%)` primary, orange accent, neumorphic surfaces) — don't reintroduce ad-hoc fonts or colors
- Design/layout changes must NOT touch crawl logic (see §6) — flag if a change appears to require it
- Small, safe diffs; changed sections only

---

## 8. RivalRadar Context

RivalRadar is a local competitor intelligence SaaS.

Each project includes:

- 1 primary business
- up to 5 competitors

It scores businesses across:

- reputation (reviews)
- local SEO visibility
- website quality
- Google Business Profile completeness
- AI visibility (LLM mentions)
- review velocity

Outputs:

- competitor comparison scores
- ranked priority actions
- change alerts

---

## 9. Output Format Rules

When responding:

- Default: bullet points only
- Code: show only changed sections
- Multi-file changes: list files first
- No duplication of unchanged code

---

## 10. When Unsure

- Ask a question instead of assuming
- Do not hallucinate schema, APIs, or logic

---
