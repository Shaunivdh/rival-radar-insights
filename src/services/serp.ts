import type { SerpData, AIVisibility } from '@/types';

interface SerpApiLocalResult {
  position: number;
  title?: string;
  website?: string;
  links?: { website?: string };
}

interface SerpApiResponse {
  local_results?: SerpApiLocalResult[];
  answer_box?: { type?: string };
  knowledge_graph?: unknown;
  ads?: unknown[];
  error?: string;
}

// Normalize a URL/domain to bare hostname for comparison
const normalizeDomain = (s: string) =>
  s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();

// Check if name words match: first significant word must appear in title,
// OR majority of words match (handles "Vets" vs "Veterinary" divergence)
function nameMatches(title: string, normalizedName: string): boolean {
  const titleLower = title.toLowerCase();
  const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
  if (nameWords.length === 0) return false;
  // First word (most distinctive) must always match
  if (!titleLower.includes(nameWords[0])) return false;
  // If only one significant word, that's enough
  if (nameWords.length === 1) return true;
  // Otherwise, require first word + at least one other word to match
  const remainingMatches = nameWords.slice(1).filter(w => titleLower.includes(w)).length;
  return remainingMatches >= 1 || nameWords.length <= 2;
}

export async function getRankingData(
  businessName: string,
  primaryService: string,
  location: string,
  apiKey: string,
  domain: string,
  ll?: { lat: number; lng: number }
): Promise<SerpData> {
  const base = 'https://serpapi.com/search.json';
  const common = `&engine=google_maps&api_key=${apiKey}&gl=gb&hl=en`;
  const llParam = ll ? `&ll=@${ll.lat},${ll.lng},12z` : '';
  const searchTerm = `${primaryService} ${location}`;

  let localJson: SerpApiResponse;
  try {
    const localRes = await fetch(
      `${base}?q=${encodeURIComponent(searchTerm)}${common}${llParam}`
    );
    if (!localRes.ok) {
      console.error('[serp] HTTP error:', localRes.status, localRes.statusText);
      return emptyResult(searchTerm);
    }
    localJson = await localRes.json() as SerpApiResponse;
  } catch (err) {
    console.error('[serp] fetch failed:', err);
    return emptyResult(searchTerm);
  }

  if (localJson.error) {
    console.error('[serp] API error:', localJson.error);
    return emptyResult(searchTerm);
  }

  const localResults: SerpApiLocalResult[] = Array.isArray(localJson.local_results)
    ? localJson.local_results
    : [];

  if (localResults.length === 0) {
    console.warn('[serp] No local results returned for:', searchTerm);
    return emptyResult(searchTerm);
  }

  const normalizedDomain = domain ? normalizeDomain(domain) : '';
  const normalizedName = businessName.toLowerCase().trim();

  console.log('[serp] normalizedDomain:', normalizedDomain, 'normalizedName:', normalizedName);

  const getLocalWebsite = (r: SerpApiLocalResult) => r.website ?? r.links?.website;

  // Check top 20 so positions >10 are still recorded
  const top20 = localResults.filter(r => r.position <= 20);
  console.log('[serp] top20 results:', top20.map(r => ({ pos: r.position, title: r.title, site: r.website ?? r.links?.website })));

  const localMatch = top20.find(r => {
    const site = getLocalWebsite(r);
    if (normalizedDomain && site && normalizeDomain(site).includes(normalizedDomain)) return true;
    // Name fallback: first significant word must match + at least one other (or single/two-word names)
    return r.title ? nameMatches(r.title, normalizedName) : false;
  });

  const localPackPresent = localResults.length > 0;
  const localVisabilityPosition = localMatch?.position ?? null;

  // Featured snippet
  const featuredSnippet = !!localJson.answer_box;

  // Knowledge panel
  const knowledgePanelPresent = !!localJson.knowledge_graph;

  // Ads above results
  const adsAboveResults = Array.isArray(localJson.ads) ? localJson.ads.length : 0;

  return {
    localVisabilityPosition,
    localPackPresent,
    featuredSnippet,
    knowledgePanelPresent,
    sitelinks: false,
    adsAboveResults,
    searchTerm,
  };
}

// --- AI presence via Claude API with web search ---

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  error?: { message: string };
}

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[.,\-–—:;!?()[\]{}]/g, ' ')
    .replace(/\b(ltd|limited|inc|llc|uk|the|and|&)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyMatch(text: string, bizName: string): boolean {
  const normText = normalizeStr(text);
  const normBiz = normalizeStr(bizName);
  if (normText.includes(normBiz)) return true;
  const bizWords = normBiz.split(' ').filter((w) => w.length >= 3);
  if (bizWords.length === 0) return false;
  const textWords = normText.split(' ');
  for (let i = 0; i <= textWords.length - bizWords.length; i++) {
    const chunk = textWords.slice(i, i + bizWords.length + 3).join(' ');
    if (bizWords.every((w) => chunk.includes(w))) return true;
  }
  return false;
}

export async function checkAIPresenceFromSerp(
  primaryService: string,
  location: string,
  businessName: string,
  _domain: string,
  _serpApiKey: string
): Promise<AIVisibility> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[ai-presence] ANTHROPIC_API_KEY not set, skipping');
    return { aiPresenceScore: 0, mentionCount: 0, totalPrompts: 0, tested_at: new Date().toISOString() };
  }

  const queries = [
    `Best ${primaryService} in ${location} UK`,
    `Top ${primaryService} near ${location} UK`,
    `Recommended ${primaryService} ${location} UK`,
  ];

  let mentionCount = 0;

  for (const query of queries) {
    try {
      let resp: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 10000));
        resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'web-search-2025-03-05',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: 'You are a helpful local business recommendation assistant. When asked about businesses in a specific area, provide specific real business names and brief descriptions. Always include specific names.',
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{ role: 'user', content: query }],
          }),
        });
        if (resp.status !== 429) break;
        console.warn(`[ai-presence] 429 rate limit, retry ${attempt + 1}/3`);
      }
      if (!resp) continue;

      if (!resp.ok) { console.warn('[ai-presence] API error:', resp.status); continue; }
      const data = await resp.json() as AnthropicResponse;
      if (data.error) { console.warn('[ai-presence] response error:', data.error.message); continue; }

      const aiText = (data.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n');

      console.log(`[ai-presence] query="${query}" textLength=${aiText.length} snippet="${aiText.slice(0, 200)}"`);
      if (fuzzyMatch(aiText, businessName)) {
        mentionCount++;
        console.log(`[ai-presence] matched "${businessName}" in response`);
      }
    } catch (e) {
      console.warn('[ai-presence] query failed:', e);
    }
  }

  const total = queries.length;
  const aiPresenceScore = total > 0 ? Math.round((mentionCount / total) * 100) : 0;

  return {
    aiPresenceScore,
    mentionCount,
    totalPrompts: total,
    tested_at: new Date().toISOString(),
  };
}

function emptyResult(searchTerm: string): SerpData {
  return {
    localVisabilityPosition: null,
    localPackPresent: false,
    featuredSnippet: false,
    knowledgePanelPresent: false,
    sitelinks: false,
    adsAboveResults: 0,
    searchTerm,
  };
}
