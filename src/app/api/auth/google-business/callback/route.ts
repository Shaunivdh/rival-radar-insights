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

  if (oauthError || !code || !cookieValue) {
    return NextResponse.redirect(new URL('/google-business?gbp=error', origin));
  }

  // Cookie format: "{state}:{userId}"
  const colonIdx = cookieValue.indexOf(':');
  const savedState = cookieValue.slice(0, colonIdx);
  const userId = cookieValue.slice(colonIdx + 1);

  if (!state || !savedState || savedState !== state || !userId) {
    return NextResponse.redirect(new URL('/google-business?gbp=error', origin));
  }

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
    return NextResponse.redirect(new URL('/google-business?gbp=error', origin));
  }

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
