import type { SerpData } from '@/types';

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

// Check if name words match (all words in normalizedName must appear in title)
function nameMatches(title: string, normalizedName: string): boolean {
  const titleLower = title.toLowerCase();
  const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
  return nameWords.length > 0 && nameWords.every(word => titleLower.includes(word));
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
  const common = `&api_key=${apiKey}&gl=gb&hl=en`;
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

  // Only check top 10
  const top10 = localResults.filter(r => r.position <= 10);

  const localMatch = top10.find(r => {
    const site = getLocalWebsite(r);
    if (normalizedDomain && site && normalizeDomain(site).includes(normalizedDomain)) return true;
    // Stricter name fallback: all words in business name must appear in title
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
