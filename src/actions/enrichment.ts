'use server';

import { getPlaceData, getPlaceDataById, postcodeToLatLng } from '@/services/google';
import { getRankingData } from '@/services/serp';
import { getTrustpilotData } from '@/services/trustpilot';
import { updateBusiness } from '@/actions/projects';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function fetchGoogleData(
  businessId: string,
  name: string,
  url: string,
  postcode?: string,
  googlePlaceId?: string | null
): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set');

  let googleData = googlePlaceId
    ? await getPlaceDataById(googlePlaceId, apiKey)
    : null;

  const usedFallback = !googlePlaceId || !googleData;
  if (!googleData) {
    googleData = await getPlaceData(name, url, apiKey, postcode);
  }

  if (!googleData) {
    throw Object.assign(
      new Error(`Google Places: no match found for "${name}"`),
      { code: 'PLACE_NOT_FOUND' }
    );
  }

  // Persist place ID alongside google_data — on fallback path this caches it for future crawls
  await updateBusiness(
    businessId,
    { googleData },
    usedFallback && googleData.placeId ? { googlePlaceId: googleData.placeId } : undefined
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
  postcode?: string
): Promise<void> {
  console.log(`[fetchSerpData] businessId=${businessId} name="${businessName}" ` +
    `primaryService="${primaryService}" location="${location}" postcode="${postcode}"`);

  if (!primaryService?.trim() || !location?.trim()) {
    console.error(`[fetchSerpData] Skipping — primaryService or location is empty`);
    return;
  }

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) throw new Error('SERP_API_KEY is not set');

  let ll: { lat: number; lng: number } | undefined;
  if (postcode) {
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (googleApiKey) {
      const coords = await postcodeToLatLng(postcode, googleApiKey);
      if (coords) ll = coords;
    }
  }

  const serpData = await getRankingData(businessName, primaryService, location, apiKey, domain, ll);
  if (!serpData) {
    console.log(`[enrich-serp] No SERP data returned for business ${businessId}`);
    return;
  }
  await updateBusiness(businessId, { serpData });
  console.log(`[enrich-serp] serp_data saved for business ${businessId}`);
}

export async function fetchTrustpilotData(businessId: string, url: string): Promise<void> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    console.warn('[enrich-trustpilot] CF credentials not set — skipping');
    return;
  }

  const data = await getTrustpilotData(url, { accountId, apiToken });

  await updateBusiness(businessId, { trustpilotData: data });

  await supabaseAdmin.from('trustpilot_data').insert({
    business_id: businessId,
    trustpilot_rating: data.trustpilotRating,
    review_count: data.trustpilotReviewCount,
    recent_reviews: data.recentTrustpilotReviews,
  });

  console.log(`[enrich-trustpilot] trustpilot_data saved for business ${businessId}`);
}
