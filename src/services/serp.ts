import type { SerpData } from '@/types';

interface SerpApiOrganicResult {
  position: number;
  link: string;
  sitelinks?: unknown;
}

interface SerpApiLocalResult {
  position: number;
  website?: string;
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
  domain: string
): Promise<SerpData> {
  const base = 'https://serpapi.com/search.json';
  const common = `&api_key=${apiKey}&gl=gb&hl=en`;

  const [organicRes, localRes] = await Promise.all([
    fetch(`${base}?q=${encodeURIComponent(`${businessName} ${primaryService} ${location}`)}${common}`),
    fetch(`${base}?q=${encodeURIComponent(`${primaryService} near ${location}`)}${common}`),
  ]);

  const [organicJson, localJson] = await Promise.all([
    organicRes.json() as Promise<SerpApiResponse>,
    localRes.json() as Promise<SerpApiResponse>,
  ]);

  // Organic position — find result whose link contains the business domain
  const organicMatch = organicJson.organic_results?.find(r =>
    r.link?.includes(domain)
  );
  const organicPosition = organicMatch?.position ?? null;

  // Local pack — check local_results for business domain
  const localMatch = localJson.local_results?.find(r =>
    r.website?.includes(domain)
  );
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
  };
}
