import { checkAIPresenceFromSerp } from '@/services/serp';
import { NextRequest, NextResponse } from 'next/server';

// DELETE THIS ROUTE after testing
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const service  = searchParams.get('service')  ?? 'veterinarian';
  const location = searchParams.get('location') ?? 'Brighton';
  const name     = searchParams.get('name')     ?? '';
  const domain   = searchParams.get('domain')   ?? '';

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'SERP_API_KEY not set' }, { status: 500 });
  if (!name)   return NextResponse.json({ error: 'name param required' }, { status: 400 });

  // Also return raw SerpApi response for debugging
  const queries = [
    `best ${service} in ${location}`,
    `top ${service} near ${location}`,
  ];

  const rawResponses: unknown[] = [];
  for (const q of queries) {
    const res = await fetch(
      `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&gl=gb&hl=en&api_key=${apiKey}`
    );
    const json = await res.json();
    rawResponses.push({ query: q, ai_overview: (json as Record<string, unknown>).ai_overview ?? null });
  }

  const result = await checkAIPresenceFromSerp(service, location, name, domain, apiKey);

  return NextResponse.json({ result, rawResponses });
}
