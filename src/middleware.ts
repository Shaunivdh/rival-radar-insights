import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = [
  '/dashboard',
  '/competitors',
  '/changes',
  '/settings',
  '/setup',
  '/action-plan',
  '/my-business',
  '/google-business',
];

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Constant-time check of the unlock cookie (HMAC hex set by /api/unlock). */
async function verifyUnlockCookie(cookieHex: string, password: string): Promise<boolean> {
  const sig = hexToBytes(cookieHex);
  if (!sig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, sig, enc.encode('rival-radar-site-unlock'));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Site-wide password lock
  if (process.env.SITE_PASSWORD) {
    const cookie = request.cookies.get('site-unlocked')?.value ?? '';
    const unlocked = await verifyUnlockCookie(cookie, process.env.SITE_PASSWORD);
    if (!unlocked && pathname !== '/unlock' && !pathname.startsWith('/api/inngest')) {
      console.log(`[middleware] site-lock: blocked path=${pathname} reason=no-valid-unlock-cookie`);
      return NextResponse.redirect(new URL('/unlock', request.url));
    }
    if (pathname !== '/unlock') {
      console.log(`[middleware] site-lock: pass path=${pathname}`);
    }
  }

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));

  // supabase.auth.getUser() is a network round trip, so only make it where the
  // answer is used: a protected path, or '/' where signed in visitors get
  // redirected. Prefetches only warm the router cache and the real navigation
  // runs this middleware again, so they can skip it too.
  if ((!isProtected && pathname !== '/') || request.headers.has('next-router-prefetch')) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(`[middleware] supabase.auth.getUser error path=${pathname}:`, authError.message);
  }

  const isDemo = request.cookies.get('rr-demo')?.value === '1';
  const isServerAction = request.headers.has('next-action');

  console.log(
    `[middleware] path=${pathname} userId=${user?.id ?? 'none'} isProtected=${isProtected} isDemo=${isDemo} isServerAction=${isServerAction}`,
  );

  if (isProtected && !user && !isDemo) {
    console.log(`[middleware] redirect→/ reason=unauthenticated-protected path=${pathname}`);
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname === '/' && user && !isServerAction) {
    const { data, error: projError } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (projError) {
      console.error(`[middleware] projects query error userId=${user.id}:`, projError.message);
    }
    const dest = data ? '/dashboard' : '/setup';
    console.log(`[middleware] redirect→${dest} userId=${user.id} hasProject=${!!data}`);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/unlock|api).*)'],
};
