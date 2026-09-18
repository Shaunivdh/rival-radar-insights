// NOTE: intentionally NOT a 'use server' file. These enrichment helpers are
// only called by the Inngest worker; marking them 'use server' exposed them
// as unauthenticated public endpoints.
import {
  getPlaceData,
  getPlaceDataById,
  postcodeToLatLng,
  postcodeToLocation,
  searchTermsForTypes,
} from '@/services/google';
import { getRankingData } from '@/services/serp';
import { updateBusiness } from '@/lib/supabase/business';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SERVICE_CATEGORIES, type ServiceCategory } from '@/lib/serviceCategories';
import type { GoogleData, SerpData } from '@/types';

export async function fetchGoogleData(
  businessId: string,
  name: string,
  url: string,
  postcode?: string,
  googlePlaceId?: string | null,
): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set');

  let googleData = googlePlaceId ? await getPlaceDataById(googlePlaceId, apiKey) : null;

  const usedFallback = !googlePlaceId || !googleData;
  if (!googleData) {
    googleData = await getPlaceData(name, url, apiKey, postcode);
  }

  if (!googleData) {
    throw Object.assign(new Error(`Google Places: no match found for "${name}"`), {
      code: 'PLACE_NOT_FOUND',
    });
  }

  // Merge new reviews with existing ones (accumulate over time, dedup by authorName+time)
  const { data: existing } = await supabaseAdmin
    .from('businesses')
    .select('google_data')
    .eq('id', businessId)
    .single();

  const existingReviews: typeof googleData.recentReviews =
    (existing?.google_data as { recentReviews?: typeof googleData.recentReviews } | null)
      ?.recentReviews ?? [];

  const newKeys = new Set(googleData.recentReviews.map((r) => `${r.authorName}|${r.time}`));
  const merged = [
    ...googleData.recentReviews,
    ...existingReviews.filter((r) => !newKeys.has(`${r.authorName}|${r.time}`)),
  ];
  googleData = { ...googleData, recentReviews: merged };

  // Persist place ID alongside google_data — on fallback path this caches it for future crawls
  await updateBusiness(
    businessId,
    { googleData },
    usedFallback && googleData.placeId ? { googlePlaceId: googleData.placeId } : undefined,
  );

  await supabaseAdmin.from('google_data').insert({
    business_id: businessId,
    google_rating: googleData.googleRating,
    review_count: googleData.reviewCount,
    place_id: googleData.placeId,
    address: googleData.address,
    recent_reviews: googleData.recentReviews,
  });

  console.log(`[enrich-google] google_data saved for business ${businessId}`);
}

export async function fetchSerpData(
  businessId: string,
  businessName: string,
  domain: string,
  primaryService: string,
  location: string,
  postcode?: string,
): Promise<void> {
  console.log(
    `[fetchSerpData] businessId=${businessId} name="${businessName}" ` +
      `primaryService="${primaryService}" location="${location}" postcode="${postcode}"`,
  );

  if (!primaryService?.trim() || !location?.trim()) {
    console.error(`[fetchSerpData] Skipping — primaryService or location is empty`);
    return;
  }

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) throw new Error('SERP_API_KEY is not set');

  let ll: { lat: number; lng: number } | undefined;
  let resolvedLocation = location;
  if (postcode) {
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (googleApiKey) {
      const coords = await postcodeToLatLng(postcode, googleApiKey);
      if (coords) ll = coords;
    }
    const canonicalLocation = await postcodeToLocation(postcode);
    if (canonicalLocation) {
      console.log(
        `[fetchSerpData] Overriding location "${location}" → "${canonicalLocation}" from postcode`,
      );
      resolvedLocation = canonicalLocation;
    }
  }

  // Fan out over the business's own Google Place categories so a competitor is measured on the
  // term it actually ranks for (e.g. a nail salon on "nail salon", not the project's "beauty salon").
  // google_data is persisted by the preceding enrich-google step, so its types are available here.
  const { data: bizRow } = await supabaseAdmin
    .from('businesses')
    .select('google_data, serp_data')
    .eq('id', businessId)
    .single();
  const businessTypes = (bizRow?.google_data as GoogleData | null)?.businessTypes ?? [];
  const previousSerp = (bizRow?.serp_data as SerpData | null) ?? null;

  const projectTerm =
    SERVICE_CATEGORIES[primaryService as ServiceCategory]?.searchTerm ?? primaryService;
  const candidateTerms = [...new Set([projectTerm, ...searchTermsForTypes(businessTypes)])].slice(
    0,
    3,
  );
  console.log(`[fetchSerpData] candidate terms for "${businessName}":`, candidateTerms);

  // Query each candidate term in parallel (they're independent) and keep the best (lowest, non-null)
  // position; the winning term is recorded in serpData.searchTerm. candidateTerms always has ≥1 entry.
  const results = await Promise.all(
    candidateTerms.map((term) =>
      getRankingData(businessName, term, resolvedLocation, apiKey, domain, ll),
    ),
  );
  let serpData: SerpData = results[0];
  for (const result of results) {
    const pos = result.localVisibilityPosition;
    if (
      pos !== null &&
      (serpData.localVisibilityPosition === null || pos < serpData.localVisibilityPosition)
    ) {
      serpData = result;
    }
  }
  // Carry the prior scan's position so overtake detection can compare real before/after.
  // Key stays absent on the first scan — that absence is what keeps baseline scans silent.
  if (previousSerp) {
    serpData = {
      ...serpData,
      previousLocalVisibilityPosition: previousSerp.localVisibilityPosition,
    };
  }
  await updateBusiness(businessId, { serpData });
  console.log(
    `[enrich-serp] serp_data saved for business ${businessId} (term="${serpData.searchTerm}", pos=${serpData.localVisibilityPosition})`,
  );
}
