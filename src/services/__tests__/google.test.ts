/** Google Places (New) client against msw with contract validation. */
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { googleHandlers, PLACES_BASE } from '@/test/msw/handlers';
import { placeAcme, placesSearchEmptyResponse } from '@/test/fixtures/providers/google';
import {
  getPlaceData,
  getPlaceDataById,
  postcodeToLatLng,
  postcodeToLocation,
  searchTermsForTypes,
} from '@/services/google';

const KEY = 'google-key-test';

describe('getPlaceData', () => {
  it('matches on domain and maps the place', async () => {
    const data = await getPlaceData('Acme Plumbing', 'acme-plumbing.test', KEY);
    expect(data).toMatchObject({
      placeId: placeAcme.id,
      googleRating: 4.8,
      reviewCount: 132,
      businessCategory: 'plumber',
      businessTypes: ['plumber'],
      photos: 2,
      description: 'Family-run plumbing firm.',
    });
    expect(data?.recentReviews).toHaveLength(2);
    expect(data?.recentReviews[0]).toMatchObject({
      rating: 5,
      authorName: 'J. Smith',
      ownerReply: 'Thanks J!',
    });
    expect(data?.recentReviews[0].time).toBe(Date.parse('2026-08-01T10:00:00Z'));
  });

  it('sends a locationBias circle when a postcode is given', async () => {
    const data = await getPlaceData('Acme Plumbing', 'acme-plumbing.test', KEY, 'BS1 1AA');
    expect(data?.placeId).toBe(placeAcme.id);
  });

  it('falls back to name match only with a postcode and only on the top result', async () => {
    const withoutDomain = { places: [{ ...placeAcme, websiteUri: undefined }] };
    server.use(...googleHandlers({ search: withoutDomain }));
    expect(await getPlaceData('Acme Plumbing', 'other-domain.test', KEY)).toBeNull();
    expect(
      (await getPlaceData('Acme Plumbing', 'other-domain.test', KEY, 'BS1 1AA'))?.placeId,
    ).toBe(placeAcme.id);
    expect(await getPlaceData('Totally Different', 'other-domain.test', KEY, 'BS1 1AA')).toBeNull();
  });

  it('returns null when Google returns no places', async () => {
    server.use(...googleHandlers({ search: placesSearchEmptyResponse }));
    expect(await getPlaceData('Acme Plumbing', 'acme-plumbing.test', KEY)).toBeNull();
  });
});

describe('getPlaceDataById', () => {
  it('maps a place by id and returns null on HTTP error', async () => {
    expect((await getPlaceDataById(placeAcme.id, KEY))?.placeId).toBe(placeAcme.id);
    server.use(http.get(`${PLACES_BASE}/:placeId`, () => HttpResponse.json({}, { status: 404 })));
    expect(await getPlaceDataById('missing', KEY)).toBeNull();
  });
});

describe('postcode helpers', () => {
  it('postcodeToLatLng reads the first place location', async () => {
    expect(await postcodeToLatLng('BS1 1AA', KEY)).toEqual({ lat: 51.4545, lng: -2.5879 });
  });

  it('postcodeToLocation joins district and county, tolerating nulls', async () => {
    expect(await postcodeToLocation('BS1 1AA')).toBe('Bristol, City of');
    server.use(
      ...googleHandlers({
        postcodes: {
          status: 200,
          result: { admin_district: 'Camden', admin_county: 'Greater London' },
        },
      }),
    );
    expect(await postcodeToLocation('NW1 1AA')).toBe('Camden, Greater London');
    server.use(...googleHandlers({ postcodes: { status: 404, result: null } }));
    expect(await postcodeToLocation('ZZ1 1ZZ')).toBeNull();
  });
});

describe('searchTermsForTypes', () => {
  it('keeps only searchable types, de-dupes and caps', () => {
    expect(
      searchTermsForTypes(
        ['beauty_salon', 'nail_salon', 'point_of_interest', 'beauty_salon', 'spa', 'gym'],
        3,
      ),
    ).toEqual(['beauty salon', 'nail salon', 'spa']);
  });
});
