import type { GoogleData } from '@/types';

const NEW_PLACES_BASE = 'https://places.googleapis.com/v1/places';

const PLACE_FIELD_MASK = 'id,displayName,rating,userRatingCount,formattedAddress,nationalPhoneNumber,regularOpeningHours,reviews,priceLevel,types,photos,location,websiteUri,editorialSummary,generativeSummary';
const SEARCH_FIELD_MASK = `places.${PLACE_FIELD_MASK.split(',').join(',places.')}`;

function mapPlaceToGoogleData(place: Record<string, unknown>): GoogleData {
  return {
    placeId: place.id as string ?? '',
    googleRating: place.rating as number ?? 0,
    reviewCount: place.userRatingCount as number ?? 0,
    businessCategory: (place.types as string[])?.[0] ?? '',
    address: place.formattedAddress as string ?? '',
    phoneNumber: place.nationalPhoneNumber as string ?? '',
    openingHours: (place.regularOpeningHours as Record<string, unknown>)?.weekdayDescriptions as string[] ?? [],
    recentReviews: ((place.reviews as unknown[]) ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
      rating: r.rating as number,
      text: (r.text as Record<string, unknown>)?.text as string ?? '',
      time: r.publishTime ? new Date(r.publishTime as string).getTime() : 0,
      authorName: (r.authorAttribution as Record<string, unknown>)?.displayName as string ?? '',
    })),
    photos: place.photos?.length ?? 0,
    priceLevel: place.priceLevel ?? null,
    description: (place.editorialSummary as Record<string, unknown>)?.text as string
      ?? (place.generativeSummary as Record<string, unknown>)?.text as string
      ?? undefined,
    website: place.websiteUri as string ?? undefined,
  };
}

export async function getPlaceDataById(
  placeId: string,
  apiKey: string
): Promise<GoogleData | null> {
  const res = await fetch(`${NEW_PLACES_BASE}/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACE_FIELD_MASK,
    },
  });
  if (!res.ok) return null;
  const place = await res.json() as Record<string, unknown>;
  if (!place.id) return null;
  return mapPlaceToGoogleData(place);
}

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
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, ...(locationBias ? { locationBias } : {}) }),
  });
  const json = await res.json();
  const places: Record<string, unknown>[] = json.places ?? [];
  const place = domain
    ? places.find((p) => {
        const placeHost = (() => { try { return new URL(p.websiteUri as string).hostname.replace(/^www\./, ''); } catch { return ''; } })();
        return placeHost === domain.replace(/^www\./, '');
      })
    : places[0];
  if (!place) return null;

  return mapPlaceToGoogleData(place);
}
