import type { GoogleData } from '@/types';

const NEW_PLACES_BASE = 'https://places.googleapis.com/v1/places';

export async function postcodeToLatLng(
  postcode: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(`${NEW_PLACES_BASE}:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.location',
    },
    body: JSON.stringify({ textQuery: postcode }),
  });
  const json = await res.json();
  const loc = json.places?.[0]?.location;
  if (!loc) return null;
  return { lat: loc.latitude as number, lng: loc.longitude as number };
}

export async function getPlaceData(
  name: string,
  url: string,
  apiKey: string,
  postcode?: string
): Promise<GoogleData | null> {
  let locationBias: object | undefined;
  if (postcode) {
    const coords = await postcodeToLatLng(postcode, apiKey);
    if (coords) {
      locationBias = {
        circle: {
          center: { latitude: coords.lat, longitude: coords.lng },
          radius: 50000,
        },
      };
    }
  }

  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    // ignore invalid url
  }
  const textQuery = domain ? `${name} ${domain}` : name;

  const res = await fetch(`${NEW_PLACES_BASE}:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.nationalPhoneNumber,places.regularOpeningHours,places.reviews,places.priceLevel,places.types,places.photos,places.location',
    },
    body: JSON.stringify({ textQuery, ...(locationBias ? { locationBias } : {}) }),
  });
  const json = await res.json();
  const place = json.places?.[0];
  if (!place) return null;

  return {
    placeId: place.id ?? '',
    googleRating: place.rating ?? 0,
    reviewCount: place.userRatingCount ?? 0,
    businessCategory: place.types?.[0] ?? '',
    address: place.formattedAddress ?? '',
    phoneNumber: place.nationalPhoneNumber ?? '',
    openingHours: place.regularOpeningHours?.weekdayDescriptions ?? [],
    recentReviews: (place.reviews ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
      rating: r.rating as number,
      text: (r.text as Record<string, unknown>)?.text as string ?? '',
      time: r.publishTime ? new Date(r.publishTime as string).getTime() / 1000 : 0,
      authorName: (r.authorAttribution as Record<string, unknown>)?.displayName as string ?? '',
    })),
    photos: place.photos?.length ?? 0,
    priceLevel: place.priceLevel ?? null,
  };
}
