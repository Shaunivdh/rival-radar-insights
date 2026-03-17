'use server';

import { getPlaceData } from '@/services/google';
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
