import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('gbp_access_token, gbp_account_name, gbp_location_name, gbp_connected_at')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    connected: !!data?.gbp_access_token,
    accountName: data?.gbp_account_name ?? null,
    locationName: data?.gbp_location_name ?? null,
    connectedAt: data?.gbp_connected_at ?? null,
  });
}
