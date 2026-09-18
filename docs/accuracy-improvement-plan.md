# Accuracy Improvement Plan

Goal: every signal shown to a user is either verified or explicitly marked unknown, and every AI recommendation cites data that exists. Measured, not assumed.

Source: audit of the crawl → extract → score → advise pipeline, 2026-09-18.

## Phase overview

| Phase | Theme                            | Effort               | Unblocks                          |
| ----- | -------------------------------- | -------------------- | --------------------------------- |
| 1     | Wiring fixes (known-wrong today) | 0.5 day              | Everything below                  |
| 2     | Extraction coverage              | 3 days               | Fewer false negatives             |
| 3     | AI-visibility honesty            | 1 day + 1 decision   | Truthful metric                   |
| 4     | Advice grounding                 | 2–3 days             | Fewer confident-but-wrong actions |
| 5     | Measurement                      | 2 days, then ongoing | Knowing the false-negative rate   |

Do phases in order. Phase 5 can start in parallel with Phase 2 if two people are available.

---

## Phase 1 — Wiring fixes

Nothing here changes crawl logic. All are data-plumbing bugs that make existing safeguards dead code.

### 1.1 One action-generation path

- **Where:** `src/inngest/crawl-worker.ts:1124-1300` (inline builder, `toPartialBiz` at line 45) and `src/lib/priorityActionsGenerator.ts:27`
- **Change:** the worker's `priority-actions` step calls `generateAndPersistProjectActions(meta.projectId)` after its `allDone` / 24-hour freshness checks. Delete `toPartialBiz` and the inline duplicate.
- **Why:** the worker hardcodes `aiVisibility: null` and `serpData: null`. The generator already selects both.
- **Done when:** `low_ai_visibility` and `not_in_local_pack` templates can fire from a scheduled crawl, not only from the manual regenerate route.

### 1.2 Pass enrichment errors into the generator

- **Where:** `src/lib/priorityActionsGenerator.ts:33` (select) and `:96` (`enrichmentErrors: null`)
- **Change:** add `enrichment_errors` to the select and map it to `enrichmentErrors`.
- **Why:** `ownDataWarnings()` in `src/services/ai.ts:222` and the `extractFailed` gate in `applyTemplates` (`src/lib/priorityTemplates.ts:471`) both read this field. Today they never see it.
- **Done when:** with `enrichment_errors.extract` set on the own business, no site-signal template fires and the prompt contains the "extraction failed" warning line. Add a unit test in `src/lib/__tests__/ai.pipeline.test.ts`.

### 1.3 Detect truncated model output

- **Where:** `extractPageSignals` (`src/services/ai.ts:81`) and `askClaude` (`:129`)
- **Change:** if `msg.stop_reason === 'max_tokens'`, log `errorType: 'truncated'` and throw. Do not attempt to parse.
- **Why:** truncated JSON currently fails as a generic parse error, indistinguishable from a model refusal or a fence problem. Telemetry cannot show how often the 1,024-token cap bites.
- **Done when:** `logAIEvent` rows carry `truncated` and a dashboard query can count them.

---

## Phase 2 — Extraction coverage

These reduce false negatives on the signals that drive templates and the website-health score. Crawl requests are untouched; only post-crawl processing changes.

### 2.1 Extract the pages that matter first

- **Where:** `src/lib/crawl/orchestrator.ts:578` (`slice(0, 5)`) and `:534` (merge order)
- **Change:** build the extraction list as root page, then priority pages (services, about, contact, accreditations), then remaining CF-discovered pages. Raise the cap via `CRAWL_AI_EXTRACT_PAGES`, default 8.
- **Cost:** Haiku 4.5 at ~7k input tokens per page ≈ $0.008/page. Eight pages ≈ $0.06 per business crawl.
- **Done when:** a fixture site whose services page is discovered as a priority link has that page's AI JSON populated.

### 2.2 Keep the footer

- **Where:** `src/services/ai.ts:87-91`
- **Change:** before slicing, also strip `<noscript>`, HTML comments, `style=`, `class=`, `data-*` attributes and inline base64 images. If still over budget, send head + first 40k chars + last 20k chars with a `<!-- truncated -->` marker between. Raise the budget to 60k chars.
- **Why:** accreditations, review-platform links, social links and service areas live in footers. The current 24k slice cuts most themed sites before the footer.
- **Done when:** fixture sites with footer-only Trustpilot or ISO badges report them.

### 2.3 Structured outputs for extraction

- **Where:** `src/services/ai.ts:93-108`
- **Change:** raise `max_tokens` to 4096 and request JSON via `output_config.format` with a JSON schema mirroring `ExtractedSignals` plus the sector-specific object. Remove the fence-stripping regex.
- **Note:** confirm `@anthropic-ai/sdk` 0.78 exposes `output_config`; upgrade if not. Verify against the SDK docs before writing code.
- **Done when:** parse failures for `extract_signals` drop to zero in telemetry over a week.

### 2.4 Deterministic fallbacks for the five uncovered fields

- **Where:** `src/lib/crawl/html-parser.ts`
- **Change:** add regex detection for
  - `socialLinksPresent`: hrefs matching facebook.com, instagram.com, linkedin.com, tiktok.com, x.com / twitter.com, youtube.com. Return platform names.
  - `hasNewsletterSignup`: `<input type="email">` near subscribe/newsletter text, or Mailchimp / Klaviyo / ConvertKit embed scripts.
  - `hasPortfolio`: links to /portfolio, /gallery, /our-work, /projects, /case-studies.
  - `serviceAreasMentioned`: text under a heading matching "areas we cover / serve / covering"; UK postcode-area tokens. Keep AI as primary, regex as fallback.
  - `portfolioItemCount`: leave AI-only; it is never used by a template.
- **Why:** when Haiku fails these become false/empty and `no_service_areas` fires against the owner.
- **Done when:** with `SKIP_AI_CALLS=true`, fixture sites with social links and a newsletter form report them.

### 2.5 Contact forms in embeds

- **Where:** `src/services/extract.ts:109` (`htmlHasContactForm`)
- **Change:** also match `<iframe src>` containing typeform.com, hsforms.net, jotform.com, forms.gle, tally.so, cognitoforms.com, and the HubSpot `hbspt.forms.create` script.
- **Done when:** a HubSpot-embed fixture reports `hasContactForm: true`.

### 2.6 Homepage h1 as its own signal

- **Where:** `src/services/extract.ts:124`, `src/lib/priorityTemplates.ts:72`, `src/types/index.ts:60`
- **Change:** add `seo.homepageH1Count: number | null` (null when the root page was unusable). `missing_h1` reads this; `h1Tags` stays a site-wide union for scoring. No migration: `seo` is JSONB.
- **Why:** the template says "your homepage has no main heading" but the signal is site-wide, so it almost never fires and is wrong when it does.
- **Done when:** a fixture with h1 on /services but none on / fires `missing_h1`.

### 2.7 Quieter services fallback

- **Where:** `src/lib/crawl/html-parser.ts:61-102`
- **Change:** drop the "any short h2/h3" harvest. Take headings and `<li>` text only inside a section whose heading, id or class matches services|treatments|what-we-do|what-we-offer|our-work|menu. Keep schema.org Service/Product/Offer names. Extend `NON_SERVICE_RE` in `src/services/extract.ts:68` with "why choose us", "latest offers", "get in touch", "our promise", "how it works".
- **Why:** noise like "Why Choose Us" reaches the LLM as a competitor's service.
- **Done when:** fixture precision for services ≥ 0.8 (see Phase 5).

### 2.8 Sitemap and robots checks

- **Where:** `src/lib/crawl/direct-checks.ts:17`
- **Change:** use GET with `AbortSignal` after headers instead of HEAD. Try `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`. Treat robots.txt as present only if the content-type is text/plain or the body contains `User-agent`.
- **Why:** HEAD gets 403/405 on many hosts (10 health points lost); SPA catch-alls return 200 HTML for robots.txt.
- **Done when:** a Wix and a WordPress fixture URL both report sitemap correctly.

---

## Phase 3 — AI-visibility honesty

### 3.1 Truthful label

- **Where:** `src/components/MetricsGrid.tsx:197`
- **Change:** "Simulated ChatGPT / Perplexity queries" → "Claude with web search, 3 local queries". Add a tooltip: "We ask an AI assistant to recommend {service} in {location} and check whether you are named."
- **Why:** nothing queries ChatGPT or Perplexity. The metric measures whether Claude's web search surfaces the business.

### 3.2 Current web-search tool

- **Where:** `src/services/ai.ts:1345`
- **Change:** `web_search_20250305` → `web_search_20260209` (supported on Sonnet 4.6+). Verify against SDK docs.

### 3.3 Reduce sampling noise

- **Where:** `src/lib/serviceCategories.ts:44` and the weekly-delta logic in the worker's `save-score-snapshot` / `apply-score-decay` steps
- **Change:** five queries per category (score steps of 20 instead of 33). Report AI presence as the mean of the last three runs. Exclude AI presence from weekly-delta change alerts unless the smoothed value moves ≥ 20.
- **Cost:** 5 Sonnet + web-search calls per business per day instead of 3. Roughly $0.03 per business per day.

### 3.4 Decision: real ChatGPT / Perplexity coverage

- Options: (a) keep Claude-only and relabel (3.1); (b) add OpenAI and Perplexity API queries — breaks the Anthropic-only rule in CLAUDE.md §5 and needs two more keys; (c) buy a tracker (Peec, Otterly, Profound) and import its score.
- Not a task until decided. Recommendation: (a) now, revisit (b) when customers ask for it by name.

---

## Phase 4 — Advice grounding

### 4.1 Structured outputs everywhere

- **Where:** `askClaude` (`src/services/ai.ts:129`) and its five callers
- **Change:** pass a JSON schema per call via `output_config.format`. Remove fence stripping and the outermost-bracket regex.
- **Done when:** no `SyntaxError` parse failures in telemetry.

### 4.2 Evidence field on LLM actions

- **Where:** `PRIORITY_SCHEMA_BASE` / `_WITH_CONTINUITY` (`src/services/ai.ts:195-197`), `deterministicChecks` (`:646`)
- **Change:** require `"evidence": ["own.signals.engagement.hasContactForm=false", "competitor.Acme.googleData.reviewCount=140"]` on every LLM action. The validator resolves each path against the real objects and drops the action (or flags it for the fact-checker) when a path does not exist or the value does not match. Strip `evidence` before persisting.
- **Why:** this is the cheapest strong hallucination guard: the model must point at the data it used and the code checks it.
- **Done when:** an action citing a non-existent signal is rejected in a unit test.

### 4.3 Existence checks for every signal

- **Where:** `EXISTENCE_CHECKS` (`src/services/ai.ts:613`)
- **Change:** generate checks from the signal schema instead of four hand-written entries: every boolean `hasX` maps to "add/set up/create X" phrases; every array maps to "add/list/get" + item. Covers contact form, FAQ, blog, schema, social links, newsletter, team page.

### 4.4 Model tier for advice generation

- **Where:** `generatePriorityActions`, `generatePriorityActionsWithHistory`, `validateActionsHybrid` (all on `AI_MODEL_FAST`)
- **Change:** route these three through `AI_MODEL_SMART`. Keep Haiku for extraction, mention extraction and sentiment.
- **Cost per project per day** (≈5k in / 2.5k out): Sonnet 5 ≈ $0.035; Opus 5 ≈ $0.09. Both negligible against the crawl cost. Decision: Sonnet 5 for balance, Opus 5 if correctness matters more than cost.

### 4.5 Update CLAUDE.md §5

- List all six AI functions (extraction, sentiment, visibility, mention extraction, generation, validation) with their real token budgets and models. The 200-token rule is not what the code does.

---

## Phase 5 — Measurement

### 5.1 Ground-truth fixture set

- **Where:** `scripts/fixtures/sites/<slug>.html` + `<slug>.expected.json`
- **Change:** 20 real UK local-business sites across builders: Wix, Squarespace, WordPress/Elementor, Shopify, static, React SPA. Fetch rendered HTML once through the existing CF path. Hand-label per site: homepage h1, ≥5 services, contact form (incl. embeds), booking provider, social links, accreditations, review platforms, sitemap.
- **Why:** without this, none of the phases above can be shown to help.

### 5.2 Deterministic eval in vitest

- **Where:** `src/services/__tests__/extract.fixtures.test.ts`
- **Change:** run `parseHtmlSignals` + `extractSignals` on every fixture with no AI. Print per-field precision and recall. Fail CI if recall for h1, contact form or services drops below the committed baseline.

### 5.3 Full-path eval script

- **Where:** `scripts/eval-extraction.ts`
- **Change:** same table but with Haiku extraction on (opt-in, ≈$0.20 per run). Run before merging any prompt or extraction change. Record results in the PR.

### 5.4 Telemetry to watch weekly

- `extract_signals` failures and `truncated` count (1.3)
- `validation` flags per generation, by type
- AI presence variance per business across runs (3.3)

---

## Decisions needed

1. ChatGPT / Perplexity: relabel, add providers, or buy a tracker (3.4)
2. Advice model: Sonnet 5 or Opus 5 (4.4)
3. Extraction page cap and per-crawl cost ceiling (2.1)

## Sequencing

Week 1: Phase 1, start 5.1, Phase 2 items 2.1–2.5.
Week 2: 2.6–2.8, Phase 3, 5.2.
Week 3: Phase 4, 5.3, baseline numbers committed.
