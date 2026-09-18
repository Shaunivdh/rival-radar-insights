/** Contract for Google Places API (New) + postcodes.io. */
import { z } from 'zod';

export const PlacesSearchTextRequest = z
  .object({
    textQuery: z.string().min(1),
    locationBias: z
      .object({
        circle: z.object({
          center: z.object({ latitude: z.number(), longitude: z.number() }),
          radius: z.number().positive(),
        }),
      })
      .optional(),
  })
  .strict();

/** Headers Places (New) requires on every call. */
export const PlacesHeaders = z.object({
  'x-goog-api-key': z.string().min(1),
  'x-goog-fieldmask': z.string().min(1),
});

export const Place = z
  .object({
    id: z.string().min(1),
    displayName: z.object({ text: z.string(), languageCode: z.string().optional() }).optional(),
    rating: z.number().min(0).max(5).optional(),
    userRatingCount: z.number().int().nonnegative().optional(),
    formattedAddress: z.string().optional(),
    nationalPhoneNumber: z.string().optional(),
    regularOpeningHours: z
      .object({ weekdayDescriptions: z.array(z.string()).optional() })
      .passthrough()
      .optional(),
    reviews: z
      .array(
        z
          .object({
            rating: z.number(),
            text: z.object({ text: z.string() }).optional(),
            publishTime: z.string().optional(),
            authorAttribution: z.object({ displayName: z.string() }).passthrough().optional(),
            ownerResponse: z.object({ text: z.string() }).passthrough().optional(),
          })
          .passthrough(),
      )
      .optional(),
    priceLevel: z.union([z.number(), z.string()]).optional(),
    types: z.array(z.string()).optional(),
    photos: z.array(z.unknown()).optional(),
    location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
    websiteUri: z.string().optional(),
    editorialSummary: z.object({ text: z.string() }).passthrough().optional(),
    generativeSummary: z.object({ text: z.string() }).passthrough().optional(),
  })
  .passthrough();

export const PlacesSearchTextResponse = z.object({ places: z.array(Place).optional() });

/** Response when the field mask is only `places.location` (postcodeToLatLng). */
export const PlacesLatLngResponse = z.object({
  places: z
    .array(z.object({ location: z.object({ latitude: z.number(), longitude: z.number() }) }))
    .optional(),
});

export const PostcodesIoResponse = z.object({
  status: z.number(),
  result: z
    .object({
      admin_district: z.string().nullable().optional(),
      admin_county: z.string().nullable().optional(),
    })
    .passthrough()
    .nullable(),
});
