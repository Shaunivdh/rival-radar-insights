/**
 * Parse deterministic SEO signals directly from raw HTML.
 * More reliable than AI extraction for structured metadata fields.
 */
export function parseHtmlSignals(html: string): Record<string, unknown> {
  const signals: Record<string, unknown> = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    signals.title = titleMatch[1]
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
  }

  // Meta description
  const metaDescMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ??
    html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
  if (metaDescMatch) signals.metaDescription = metaDescMatch[1].trim();

  // H1 tags
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h1Tags = h1Matches
    .map(m => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  if (h1Tags.length > 0) signals.h1Tags = h1Tags;

  // Canonical tag
  signals.canonicalTagsPresent = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html);

  // Schema markup types from ld+json (AI strips these, so parse here)
  const ldJsonMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const schemaTypes = new Set<string>();
  for (const match of ldJsonMatches) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const graph = parsed['@graph'];
      const nodes = Array.isArray(graph) ? graph : [parsed];
      for (const node of nodes) {
        const t = (node as Record<string, unknown>)['@type'];
        if (Array.isArray(t)) t.forEach(v => typeof v === 'string' && schemaTypes.add(v));
        else if (typeof t === 'string') schemaTypes.add(t);
      }
    } catch { /* ignore malformed JSON */ }
  }
  if (schemaTypes.size > 0) signals.schemaMarkupTypes = [...schemaTypes];

  // Alt tag coverage
  const imgMatches = [...html.matchAll(/<img[^>]+>/gi)];
  if (imgMatches.length > 0) {
    const withAlt = imgMatches.filter(m => /\balt=["'][^"']+["']/i.test(m[0])).length;
    const ratio = withAlt / imgMatches.length;
    signals.altTagCoverage = ratio >= 0.9 ? 'full' : ratio >= 0.5 ? 'partial' : 'none';
  }

  return signals;
}
