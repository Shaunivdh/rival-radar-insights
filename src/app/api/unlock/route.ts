import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

/** Derive a token from the password so the raw password is never stored in a cookie. */
function signUnlockToken(password: string): string {
  return createHmac('sha256', password).update('rival-radar-site-unlock').digest('hex');
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.SITE_PASSWORD || password !== process.env.SITE_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('site-unlocked', signUnlockToken(process.env.SITE_PASSWORD), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
