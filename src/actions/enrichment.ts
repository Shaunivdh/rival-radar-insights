'use server';

import {
  getPlaceData,
  getPlaceDataById,
  postcodeToLatLng,
  postcodeToLocation,
} from '@/services/google';
import { getRankingData } from '@/services/serp';
import { updateBusiness } from '@/actions/projects';
import { supabaseAdmin } from '@/lib/supabase/server';

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

  const serpData = await getRankingData(
    businessName,
    primaryService,
    resolvedLocation,
    apiKey,
    domain,
    ll,
  );
  if (!serpData) {
    console.log(`[enrich-serp] No SERP data returned for business ${businessId}`);
    return;
  }
  await updateBusiness(businessId, { serpData });
  console.log(`[enrich-serp] serp_data saved for business ${businessId}`);
}
