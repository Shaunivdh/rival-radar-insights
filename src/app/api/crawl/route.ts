import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name, crawl_status')
    .eq('project_id', projectId);

  return NextResponse.json({ businesses: businesses ?? [] });
}

export async function POST(req: NextRequest) {
  const { businessId, mode } = (await req.json()) as {
    businessId: string;
    mode: 'initial' | 'incremental';
  };

  if (!businessId || !mode) {
    return NextResponse.json({ error: 'Missing businessId or mode' }, { status: 400 });
  }

  await inngest.send({ name: 'crawl/business.scan', data: { businessId, mode } });

  return NextResponse.json({ ok: true });
}
