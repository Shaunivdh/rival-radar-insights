import type { GoogleData } from '@/types';

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

export async function getPlaceData(
  name: string,
  _url: string,
  apiKey: string
): Promise<GoogleData | null> {
  // 1. Find place_id
  const findRes = await fetch(
    `${PLACES_BASE}/findplacefromtext/json?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id&key=${encodeURIComponent(apiKey)}`
  );
  const findJson = await findRes.json();
  const placeId: string | undefined = findJson.candidates?.[0]?.place_id;
  if (!placeId) return null;

  // 2. Fetch place details
  const fields = 'name,rating,user_ratings_total,formatted_address,formatted_phone_number,opening_hours,reviews,photos,price_level,types';
  const detailRes = await fetch(
    `${PLACES_BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${encodeURIComponent(apiKey)}`
  );
  const { result } = await detailRes.json();
  if (!result) return null;

  return {
    placeId,
    googleRating: result.rating ?? 0,
    reviewCount: result.user_ratings_total ?? 0,
    businessCategory: result.types?.[0] ?? '',
    address: result.formatted_address ?? '',
    phoneNumber: result.formatted_phone_number ?? '',
    openingHours: result.opening_hours?.weekday_text ?? [],
    recentReviews: (result.reviews ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
      rating: r.rating as number,
      text: r.text as string,
      time: r.time as number,
      authorName: r.author_name as string,
    })),
    photos: result.photos?.length ?? 0,
    priceLevel: result.price_level ?? null,
  };
}
