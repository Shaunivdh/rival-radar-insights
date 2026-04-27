import { NextRequest, NextResponse } from 'next/server';

// DELETE THIS ROUTE after testing — checkAIPresenceFromSerp was removed
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const service  = searchParams.get('service')  ?? 'veterinarian';
  const location = searchParams.get('location') ?? 'Brighton';

  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'SERP_API_KEY not set' }, { status: 500 });

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

  return NextResponse.json({ rawResponses });
}
