/** Recorded-shape Google Places (New) + postcodes.io responses (trimmed). */
export const placeAcme = {
  id: 'ChIJtest_acme_plumbing',
  displayName: { text: 'Acme Plumbing', languageCode: 'en' },
  rating: 4.8,
  userRatingCount: 132,
  formattedAddress: '12 Pipe Street, Bristol BS1 1AA, UK',
  nationalPhoneNumber: '0117 123 4567',
  regularOpeningHours: {
    weekdayDescriptions: [
      'Monday: 8:00 AM – 6:00 PM',
      'Tuesday: 8:00 AM – 6:00 PM',
      'Wednesday: 8:00 AM – 6:00 PM',
      'Thursday: 8:00 AM – 6:00 PM',
      'Friday: 8:00 AM – 6:00 PM',
      'Saturday: Closed',
      'Sunday: Closed',
    ],
  },
  reviews: [
    {
      rating: 5,
      text: { text: 'Fixed our boiler same day. Brilliant.' },
      publishTime: '2026-08-01T10:00:00Z',
      authorAttribution: { displayName: 'J. Smith' },
      ownerResponse: { text: 'Thanks J!' },
    },
    {
      rating: 4,
      text: { text: 'Good work, slightly pricey.' },
      publishTime: '2026-07-15T10:00:00Z',
      authorAttribution: { displayName: 'A. Patel' },
    },
  ],
  types: ['plumber', 'point_of_interest', 'establishment'],
  photos: [{ name: 'places/x/photos/1' }, { name: 'places/x/photos/2' }],
  location: { latitude: 51.4545, longitude: -2.5879 },
  websiteUri: 'https://www.acme-plumbing.test/',
  editorialSummary: { text: 'Family-run plumbing firm.' },
};

export const placesSearchResponse = { places: [placeAcme] };
export const placesSearchEmptyResponse = {};
export const placesLatLngResponse = { places: [{ location: placeAcme.location }] };

export const postcodesIoResponse = {
  status: 200,
  result: { postcode: 'BS1 1AA', admin_district: 'Bristol, City of', admin_county: null },
};
