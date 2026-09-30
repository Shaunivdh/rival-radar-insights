# Action plan improvement prompts

Goal: bite-sized, competitor-aware actions that help customers stand out and improve local SEO, using as few Claude tokens as possible. Run one prompt per session, in order, and commit between them.

## Known gaps in the original analysis

- The analysis came from reading code, not from live plan output. Prompt 1 establishes a baseline.
- Token savings figures were estimates. Measure them with `logAIEvent` telemetry.
- Dedup uses the exact `action` string (`priorityActionsGenerator.ts`), so headlines must stay static. Numbers belong in `whyItMatters`, `competitorReference` or `steps`.
- Fixing continuity needs a stored template id on `priority_actions`, which may require a migration.
- Site tips depend on extraction working. If `signals` is often null, templates will not fire.
- Unverified: whether `googleData.description` is ever populated. If it isn't, `no_gbp_description` fires for everyone.
- Template actions also pass through `validateActionsHybrid`. False flags would trigger Sonnet calls.
- Pasteable snippets may need UI changes to render.

## Prompt 1 findings (30 Sep 2026, local Supabase: 2 projects, 8 action rows)

- Signals are healthy: 0 of 2 own businesses have null signals or extract errors. Extraction is deterministic now (`scripts/eval-extraction.ts`), so site templates can be relied on.
- `no_gbp_description` is broken by design. `googleData.description` comes from Places `editorialSummary` / `generativeSummary` (`src/services/google.ts:77`), which Google writes, not the owner. It was empty for 2 of 2 businesses, so the template always fires and may tell owners to write a description they already have. Remove or reword it (prompt 2).
- Template fire counts: `no_recent_reviews` 2, `no_gbp_description` 2, `missing_alt_tags` / `no_contact_form` / `no_faq` / `no_team_page` / `slow_mobile_site` 1 each. One business fired 7 templates, so `slow_mobile_site` (high impact) lost its slot to file order (prompt 4).
- Dedup on text is fragile: a stored row reads "Get fresh reviews — yours have gone quiet" (old copy with a dash), while the template now says "Get fresh reviews: yours have gone quiet". Any copy edit creates a duplicate action. This supports adding a template id (prompt 3).
- 0 of 2 LLM rows have a `competitorReference`, so the plan currently shows no competitor comparison at all.
- Token telemetry only goes to logs (`src/lib/aiTelemetry.ts:38`, `logger.info`), not the DB, so average tokens per run cannot be queried. Prompt 8 should capture them.
- Validator: the "recommends existing" check skips templates (`src/services/ai/validation.ts:224`); the "unverified average" regex still runs on them, but no template copy matches it. Other checks were not traced.
- `priority_actions` has no template id column (`src/types/database.ts:472`). Prompt 3 needs a migration.
- `src/views/ActionPlan.tsx` renders every PriorityAction field, including `competitorReference` and `steps`. There is no snippet field, so pasteable text goes in `steps` unless a new field and UI are added.

## 1. Baseline and verification (no code changes)

```
Read-only investigation, no edits. For the action plan pipeline (src/lib/priorityActionsGenerator.ts, src/services/ai/actions.ts, src/lib/priorityTemplates.ts, src/services/ai/validation.ts):
1. Using Supabase data for every project, report which templates fire (use diagnoseTemplates) and how often each one fires.
2. Report the share of own businesses with null signals, and with enrichmentErrors.extract set.
3. Check whether googleData.description is ever populated. Tell me which Places field feeds it.
4. From AI telemetry, report the average input and output tokens and the number of calls per generation run (generation, distribution retry, validation).
5. Check whether deterministicChecks in validation.ts can flag template-sourced actions.
6. Check whether the priority_actions table has any column identifying the template that produced a row.
7. List which PriorityAction fields the /action-plan UI renders.
Output: bullet findings with file:line references. No recommendations yet.
```

## 2. Trigger bug fixes (TDD)

```
Use the tdd skill. In src/lib/priorityTemplates.ts, fix the false positives when data is missing, not absent:
- low_review_count: do not fire when googleData or reviewCount is null.
- no_business_hours: do not fire when googleData is null or enrichmentErrors.google is set.
- no_gbp_description: googleData.description is Google's editorialSummary/generativeSummary, not the owner's description, so this template fires for everyone. Propose either removing it or rewording it as a "check your description covers your services and town" tip that never claims it is missing. Wait for my choice before changing it.
- Add requiresGoogleData to PriorityTemplate, mirroring how requiresSiteSignals is handled.
Write failing tests first in the existing templates test file. Minimal diff. Do not touch crawl logic or copy.
```

## 3. Stable template identity and a continuity fix

```
Continuity in applyTemplatesWithHistory (src/lib/priorityTemplates.ts) matches previous actions by category, so it falsely tells users they "closed" gaps.
Goal: match by template id.
- If priority_actions has no template id column, stop and propose a migration (name, type, nullable, backfill by exact action text match) and wait for my approval.
- Once the column exists: persist the template id on insert in priorityActionsGenerator.ts, map it in priorityActionRow, and compute closedFromLastWeek only from template ids that fired last week and do not fire now. LLM actions are never counted as "closed".
- Dedup in priorityActionsGenerator.ts: use template id when present, and the action text otherwise.
TDD. Regenerate DB types after the migration.
```

## 4. Ranking by impact

```
Replace the order-in-file selection in applyTemplates / applyTemplatesWithHistory with deterministic ranking.
- Add impactWeight (1 to 5) to each template.
- score = impactWeight × categoryWeakness × effortFactor. categoryWeakness = (100 minus own score for the mapped category) / 100, using CATEGORY_SCORE_MAP_FULL; use 0.5 when the score is missing. effortFactor: low 1.0, medium 0.7, high 0.4.
- Tie-break on template id, so output is stable.
- Return all fired templates sorted, so the rest can be queued.
Propose the weights table to me before writing code. TDD with fixture businesses.
```

## 5. Competitor comparison and personalisation, no AI

```
Give templates an optional compare(own, competitors) that returns { competitorReference, whyItMattersSuffix } using real numbers, e.g. the best competitor's photo count vs ours. Only reference a competitor that is strictly better on that metric; otherwise null.
Add placeholder filling for {service} (from primary_service) and {town} (parsed from googleData.address; fall back to the generic wording if parsing fails).
Rules:
- The action headline must stay static text (dedup depends on it). Put numbers only in whyItMatters, competitorReference and steps.
- CLAUDE.md copy style: UK English, no dashes or arrows in any user-facing string, including ranges.
Pass competitors through from generatePriorityActions. TDD, including a test that asserts no dash characters appear in rendered output.
```

## 6. Grow the tip catalogue (batches of 10)

```
Add 10 new bite-sized templates (under 2 hours each) to src/lib/priorityTemplates.ts, using only existing fields in ExtractedSignals, GoogleData, SerpData and PageSpeedData. Do not invent fields.
Candidates:
- title missing town or service
- hasSitemap false
- canonicalTagsPresent false
- hasBookingSystem false while a competitor has one
- insuranceMentioned false
- guaranteesMentioned empty
- hasPortfolio false or portfolioItemCount < 3
- socialLinksPresent empty
- ctaText vague ("submit", "learn more", "click here")
- accreditations present but not surfaced
Each template needs a clear trigger with null guards, an impactWeight, steps a non-marketer can follow, and at least one pasteable snippet (e.g. a suggested title or review request text) built from placeholders.
Show me the list with triggers before writing code. Copy style rules from CLAUDE.md apply. Add a test per trigger.
```

## 7. Shrink the LLM step

```
In src/services/ai/actions.ts, reduce LLM usage for priority actions:
- Skip the LLM when 5 or more templates fire (already the case), and also when at least 3 fire and a new AI_FILL_THRESHOLD setting says so. Ask me for the default.
- When the LLM runs, ask for at most 1 action: a competitor insight templates cannot express.
- Replace full summariseBiz JSON with a trimmed payload: own scores, the fields relevant to gaps not covered by fired templates, and the same fields for competitors.
- Remove the distribution retry when only 1 slot is requested.
- Make the model configurable (FAST vs SMART) and report the token difference on fixtures before choosing.
Keep the evidence grounding and TruncatedOutputError handling unchanged. Update the CLAUDE.md AI table if max_tokens changes.
```

## 8. Evaluation harness

```
Create a script (scratch or scripts/, following the existing pattern) that runs the action plan pipeline against 5 to 10 real project fixtures with SKIP_AI off. For each project, output the plan, the source of each action (template or llm), input and output tokens, and dash or US-spelling violations. Save a before/after comparison as markdown so I can review plan quality across the changes above.
```
