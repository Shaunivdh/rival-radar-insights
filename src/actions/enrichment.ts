'use server';

import { getPlaceData, getPlaceDataById, postcodeToLatLng } from '@/services/google';
import { getRankingData } from '@/services/serp';
import { updateBusiness } from '@/actions/projects';

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

export async function fetchTrustpilotData(_businessId: string, _url: string): Promise<void> {
  // Removed: Trustpilot scraping violates ToS
}
