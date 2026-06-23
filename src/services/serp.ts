import type { SerpData } from '@/types';
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/serviceCategories';

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
  s
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase();

// Check if name words match: first significant word must appear in title,
// OR majority of words match (handles "Vets" vs "Veterinary" divergence)
function nameMatches(title: string, normalizedName: string): boolean {
  const titleLower = title.toLowerCase();
  const nameWords = normalizedName.split(/\s+/).filter((w) => w.length > 2);
  if (nameWords.length === 0) return false;
  // First word (most distinctive) must always match
  if (!titleLower.includes(nameWords[0])) return false;
  // If only one significant word, that's enough
  if (nameWords.length === 1) return true;
  // Otherwise, require first word + at least one other word to match
  const remainingMatches = nameWords.slice(1).filter((w) => titleLower.includes(w)).length;
  return remainingMatches >= 1 || nameWords.length <= 2;
}

export async function getRankingData(
  businessName: string,
  primaryService: string,
  location: string,
  apiKey: string,
  domain: string,
  ll?: { lat: number; lng: number },
): Promise<SerpData> {
  const base = 'https://serpapi.com/search.json';
  const common = `&engine=google_maps&api_key=${apiKey}&gl=gb&hl=en`;
  // Tighter zoom biases the local pack to the business's immediate area rather than a city-wide region.
  const llParam = ll ? `&ll=@${ll.lat},${ll.lng},14z` : '';
  // Map the stored category key to a natural search phrase; fall back to the raw value for legacy data.
  const service = SERVICE_CATEGORIES[primaryService as ServiceCategory]?.searchTerm ?? primaryService;
  // When coordinates are available let `ll` define the geography and search by service alone —
  // appending a broad place name (e.g. a London borough like "Southwark") pushes hyperlocal
  // businesses out of the local pack so nobody ranks. Without coords, fall back to the place name.
  const searchTerm = ll ? service.trim() : `${service} ${location}`.replace(/\s+/g, ' ').trim();

  let localJson: SerpApiResponse;
  try {
    const localRes = await fetch(`${base}?q=${encodeURIComponent(searchTerm)}${common}${llParam}`);
    if (!localRes.ok) {
      console.error('[serp] HTTP error:', localRes.status, localRes.statusText);
      return emptyResult(searchTerm);
    }
    localJson = (await localRes.json()) as SerpApiResponse;
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
  const top20 = localResults.filter((r) => r.position <= 20);
  console.log(
    '[serp] top20 results:',
    top20.map((r) => ({ pos: r.position, title: r.title, site: r.website ?? r.links?.website })),
  );

  const localMatch = top20.find((r) => {
    const site = getLocalWebsite(r);
    if (normalizedDomain && site && normalizeDomain(site).includes(normalizedDomain)) return true;
    // Name fallback: first significant word must match + at least one other (or single/two-word names)
    return r.title ? nameMatches(r.title, normalizedName) : false;
  });

  const localPackPresent = localResults.length > 0;
  const localVisibilityPosition = localMatch?.position ?? null;

  // Featured snippet
  const featuredSnippet = !!localJson.answer_box;

  // Knowledge panel
  const knowledgePanelPresent = !!localJson.knowledge_graph;

  // Ads above results
  const adsAboveResults = Array.isArray(localJson.ads) ? localJson.ads.length : 0;

  return {
    localVisibilityPosition,
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
    localVisibilityPosition: null,
    localPackPresent: false,
    featuredSnippet: false,
    knowledgePanelPresent: false,
    sitelinks: false,
    adsAboveResults: 0,
    searchTerm,
  };
}
