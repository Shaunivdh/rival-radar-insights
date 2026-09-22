# Extraction ground-truth fixtures

One `<slug>.html` (rendered homepage) + `<slug>.expected.json` (hand-labelled truth) per site.

Labelled fields: `homepageH1`, `services` (≥5), `hasContactForm` (native forms and embeds),
`bookingProvider`, `socialLinks`, `accreditations` (union of accreditations, certifications,
awards/memberships), `reviewPlatforms`, `sitemap` (needs the network — not scored offline).

Keys starting with `_` are notes and are ignored by the eval.

## Runs

- `npm test` — `src/services/__tests__/extract.fixtures.test.ts` runs the deterministic path
  (`parseHtmlSignals` → `extractSignals`, no AI) and fails when recall for h1, contact form or
  services drops below `baseline.json`.
- `bunx tsx scripts/eval-extraction.ts` — same table with Haiku extraction merged in (≈$0.01 per
  fixture). Run before merging any prompt or extraction change and paste the table into the PR.

## Status

The current set is **six synthetic pages**, one per builder (Wix, Squarespace, WordPress/Elementor,
Shopify, static HTML, rendered React SPA), written to reproduce each builder's markup habits. The
plan calls for **20 real UK local-business homepages fetched once through the Cloudflare render
path and hand-labelled**; the synthetic set is the harness, not the measurement. To add a real site:

1. Fetch rendered HTML through `crawlSinglePage` (or copy from the crawl cache) into `<slug>.html`.
2. Label `<slug>.expected.json` by reading the page, not the parser output.
3. Run both evals; if a baseline floor moves, update `baseline.json` in the same commit and say why.
