// Client-safe GBP types and constants. Kept separate from gbp.ts, which
// imports the service-role Supabase client and is server-only.

export interface GBPAccount {
  name: string;
  accountName: string;
  type: string;
}

export interface GBPLocation {
  name: string;
  locationName: string;
  primaryPhone?: string;
  websiteUrl?: string;
  storefrontAddress?: { addressLines?: string[] };
}

export interface GBPReview {
  name: string;
  reviewId: string;
  reviewer: { displayName: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: { comment: string; updateTime: string };
}

export const STAR_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};
