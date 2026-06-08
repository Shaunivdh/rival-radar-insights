import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get('gbp_oauth_state')?.value;

  console.log(
    `[gbp-callback] received code=${!!code} state=${state} oauthError=${oauthError ?? 'none'} hasCookie=${!!cookieValue}`,
  );

  if (oauthError || !code || !cookieValue) {
    console.error(
      `[gbp-callback] early error: oauthError=${oauthError} hasCode=${!!code} hasCookie=${!!cookieValue}`,
    );
    return NextResponse.redirect(new URL('/google-business?gbp=error', origin));
  }

  // Cookie format: "{state}:{userId}"
  const colonIdx = cookieValue.indexOf(':');
  const savedState = cookieValue.slice(0, colonIdx);
  const userId = cookieValue.slice(colonIdx + 1);

  if (!state || !savedState || savedState !== state || !userId) {
    console.error(
      `[gbp-callback] state mismatch or missing userId: savedState=${savedState} receivedState=${state} hasUserId=${!!userId}`,
    );
    return NextResponse.redirect(new URL('/google-business?gbp=error', origin));
  }

  console.log(`[gbp-callback] state ok userId=${userId} - exchanging code for tokens`);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${origin}/api/auth/google-business/callback`,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    console.error(
      `[gbp-callback] token exchange failed status=${tokenRes.status} body=${body.slice(0, 200)} userId=${userId}`,
    );
    return NextResponse.redirect(new URL('/google-business?gbp=error', origin));
  }
  console.log(`[gbp-callback] token exchange succeeded userId=${userId}`);

  const tokens = await tokenRes.json();
  const expiry = new Date(Date.now() + tokens.expires_in * 1000);

  const { error: upsertError } = await supabaseAdmin.from('app_settings').upsert({
    user_id: userId,
    gbp_access_token: tokens.access_token,
    gbp_refresh_token: tokens.refresh_token,
    gbp_token_expiry: expiry.toISOString(),
    gbp_connected_at: new Date().toISOString(),
    gbp_account_name: null,
    gbp_location_name: null,
  });

  if (upsertError) {
    console.error('[gbp-callback] upsert failed:', upsertError.message);
    return NextResponse.redirect(new URL('/google-business?gbp=error', origin));
  }

  const response = NextResponse.redirect(new URL('/google-business?gbp=connected', origin));
  response.cookies.delete('gbp_oauth_state');
  return response;
}
