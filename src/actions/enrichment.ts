'use server';

import { getPlaceData, postcodeToLatLng } from '@/services/google';
import { getRankingData } from '@/services/serp';
import { updateBusiness } from '@/actions/projects';

export async function fetchGoogleData(
  businessId: string,
  name: string,
  url: string
): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set');

  const googleData = await getPlaceData(name, url, apiKey);
  if (!googleData) {
    console.log(`[enrich-google] No Google data returned for business ${businessId}`);
    return;
  }

  await updateBusiness(businessId, { googleData });
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
