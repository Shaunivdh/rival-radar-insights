'use server';

import { getPlaceData } from '@/services/google';
import { getRankingData } from '@/services/serp';
import { getTrustpilotData } from '@/services/trustpilot';
import { updateBusiness } from '@/actions/projects';

export async function fetchGoogleData(
  businessId: string,
  name: string,
  url: string
): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set');

  const googleData = await getPlaceData(name, url, apiKey);
  if (!googleData) return;

  await updateBusiness(businessId, { googleData });
}

export async function fetchSerpData(
  businessId: string,
  businessName: string,
  domain: string,
  primaryService: string,
  location: string
): Promise<void> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) throw new Error('SERP_API_KEY is not set');

  const serpData = await getRankingData(businessName, primaryService, location, apiKey, domain);
  await updateBusiness(businessId, { serpData });
}

export async function fetchTrustpilotData(businessId: string, url: string): Promise<void> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) throw new Error('CF_ACCOUNT_ID or CF_API_TOKEN is not set');

  const trustpilotData = await getTrustpilotData(url, { accountId, apiToken });
  await updateBusiness(businessId, { trustpilotData });
}
