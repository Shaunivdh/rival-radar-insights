import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

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
