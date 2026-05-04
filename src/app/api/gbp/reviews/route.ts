import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getValidToken, listReviews, upsertReply, deleteReply } from '@/services/gbp';

async function getUser(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const user = await getUser(cookieStore);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('gbp_location_name')
    .eq('user_id', user.id)
    .single();

  if (!data?.gbp_location_name) {
    return NextResponse.json({ error: 'No location selected' }, { status: 400 });
  }

  const pageToken = new URL(request.url).searchParams.get('pageToken') ?? undefined;

  try {
    const token = await getValidToken(user.id);
    const result = await listReviews(token, data.gbp_location_name, pageToken);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const user = await getUser(cookieStore);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('gbp_location_name')
    .eq('user_id', user.id)
    .single();

  if (!data?.gbp_location_name) {
    return NextResponse.json({ error: 'No location selected' }, { status: 400 });
  }

  const body = await request.json() as { action: 'reply' | 'delete_reply'; reviewId: string; comment?: string };

  try {
    const token = await getValidToken(user.id);

    if (body.action === 'reply') {
      if (!body.comment) return NextResponse.json({ error: 'comment required' }, { status: 400 });
      const result = await upsertReply(token, data.gbp_location_name, body.reviewId, body.comment);
      return NextResponse.json(result);
    }

    if (body.action === 'delete_reply') {
      await deleteReply(token, data.gbp_location_name, body.reviewId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
