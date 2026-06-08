import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(c) {
          c.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[gbp-auth] GET no session - redirecting to /');
    if (authError) console.error('[gbp-auth] getUser error:', authError.message);
    return NextResponse.redirect(new URL('/', request.url));
  }

  const state = crypto.randomUUID();
  const { origin } = new URL(request.url);
  console.log(`[gbp-auth] initiating OAuth userId=${user.id} state=${state}`);

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/google-business/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/business.manage',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  // Store state + userId so callback can verify + know which user to update
  response.cookies.set('gbp_oauth_state', `${state}:${user.id}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
