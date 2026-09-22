import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Optionally revoke the token at Google
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('gbp_access_token')
    .eq('user_id', user.id)
    .single();

  if (data?.gbp_access_token) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: data.gbp_access_token }),
    }).catch(() => {}); // best-effort
  }

  await supabaseAdmin
    .from('app_settings')
    .update({
      gbp_access_token: null,
      gbp_refresh_token: null,
      gbp_token_expiry: null,
      gbp_account_name: null,
      gbp_location_name: null,
      gbp_connected_at: null,
    })
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
