import { supabaseAdmin } from '@/lib/supabase/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const GBP_V4 = 'https://mybusiness.googleapis.com/v4';

// ── Token management ──────────────────────────────────────────────────────────

export async function getValidToken(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('gbp_access_token, gbp_refresh_token, gbp_token_expiry')
    .eq('user_id', userId)
    .single();

  if (error || !data?.gbp_refresh_token) throw new Error('GBP not connected');

  const expiry = data.gbp_token_expiry ? new Date(data.gbp_token_expiry) : null;
  if (data.gbp_access_token && expiry && expiry.getTime() - Date.now() > 5 * 60 * 1000) {
    return data.gbp_access_token;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.gbp_refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.error === 'invalid_grant') throw new Error('GBP_TOKEN_REVOKED');
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  const tokens = await res.json();
  if (!tokens.access_token || typeof tokens.expires_in !== 'number') {
    throw new Error('Unexpected token response from Google');
  }
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000);

  const { error: dbError } = await supabaseAdmin
    .from('app_settings')
    .update({ gbp_access_token: tokens.access_token, gbp_token_expiry: newExpiry.toISOString() })
    .eq('user_id', userId);
  if (dbError) throw new Error(`Failed to persist refreshed token: ${dbError.message}`);

  return tokens.access_token;
}

// ── GBP API helpers ───────────────────────────────────────────────────────────

export async function listAccounts(token: string) {
  const res = await fetch(ACCOUNTS_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`listAccounts failed: ${res.status}`);
  return res.json() as Promise<{ accounts: GBPAccount[] }>;
}

export async function listLocations(token: string, accountName: string) {
  const res = await fetch(`${GBP_V4}/${accountName}/locations?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`listLocations failed: ${res.status}`);
  return res.json() as Promise<{ locations: GBPLocation[] }>;
}

export async function listReviews(token: string, locationName: string, pageToken?: string) {
  const url = new URL(`${GBP_V4}/${locationName}/reviews`);
  url.searchParams.set('pageSize', '50');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`listReviews failed: ${res.status}`);
  return res.json() as Promise<{
    reviews: GBPReview[];
    nextPageToken?: string;
    totalReviewCount?: number;
    averageRating?: number;
  }>;
}

export async function upsertReply(
  token: string,
  locationName: string,
  reviewId: string,
  comment: string,
) {
  const res = await fetch(`${GBP_V4}/${locationName}/reviews/${reviewId}/reply`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) throw new Error(`upsertReply failed: ${res.status}`);
  return res.json();
}

export async function deleteReply(token: string, locationName: string, reviewId: string) {
  const res = await fetch(`${GBP_V4}/${locationName}/reviews/${reviewId}/reply`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`deleteReply failed: ${res.status}`);
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
