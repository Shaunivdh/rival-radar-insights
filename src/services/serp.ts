import type { SerpData } from '@/types';

interface SerpApiOrganicResult {
  position: number;
  link: string;
  sitelinks?: unknown;
}

interface SerpApiLocalResult {
  position: number;
  title?: string;
  website?: string;
  links?: { website?: string };
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
  local_results?: SerpApiLocalResult[];
  answer_box?: { type?: string };
  knowledge_graph?: unknown;
  ads?: unknown[];
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
  const llParam = ll ? `&ll=@${ll.lat},${ll.lng},14z` : '';
  const searchTerm = `${primaryService} ${location}`;

  const [organicRes, localRes] = await Promise.all([
    fetch(`${base}?q=${encodeURIComponent(`${businessName} ${primaryService} ${location}`)}${common}`),
    fetch(`${base}?q=${encodeURIComponent(searchTerm)}${common}${llParam}`),
  ]);

  const [organicJson, localJson] = await Promise.all([
    organicRes.json() as Promise<SerpApiResponse>,
    localRes.json() as Promise<SerpApiResponse>,
  ]);

  // Normalize a URL/domain to bare hostname for comparison
  const normalizeDomain = (s: string) =>
    s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();

  const normalizedDomain = domain ? normalizeDomain(domain) : '';
  const normalizedName = businessName.toLowerCase().trim();

  // Organic position — find result whose link contains the business domain
  const organicMatch = organicJson.organic_results?.find(r =>
    normalizedDomain && r.link && normalizeDomain(r.link).includes(normalizedDomain)
  );
  const organicPosition = organicMatch?.position ?? null;

  // Local pack — match by domain first, fall back to business name
  const getLocalWebsite = (r: SerpApiLocalResult) => r.website ?? r.links?.website;
  console.log('[serp] normalizedDomain:', normalizedDomain, 'normalizedName:', normalizedName);
  console.log('[serp] local_results:', JSON.stringify(localJson.local_results?.map(r => ({ pos: r.position, title: r.title, website: getLocalWebsite(r) }))));
  const localMatch = localJson.local_results?.find(r => {
    const site = getLocalWebsite(r);
    if (normalizedDomain && site && normalizeDomain(site).includes(normalizedDomain)) return true;
    // fallback: match by business name if no website or domain mismatch
    return r.title && r.title.toLowerCase().includes(normalizedName);
  });
  const localPackPresent = (localJson.local_results?.length ?? 0) > 0;
  const localPackPosition = localMatch?.position ?? null;

  // Featured snippet (answer_box present)
  const featuredSnippet = !!organicJson.answer_box;

  // Knowledge panel
  const knowledgePanelPresent = !!organicJson.knowledge_graph;

  // Sitelinks — present on the matched organic result itself
  const sitelinks = !!organicMatch?.sitelinks;

  // Ads above results
  const adsAboveResults = Array.isArray(organicJson.ads) ? organicJson.ads.length : 0;

  return {
    organicPosition,
    localPackPosition,
    localPackPresent,
    featuredSnippet,
    knowledgePanelPresent,
    sitelinks,
    adsAboveResults,
    searchTerm,
  };
}
