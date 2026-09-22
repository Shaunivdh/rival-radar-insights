import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

const PROTECTED = ['/dashboard', '/competitors', '/changes', '/settings', '/setup'];

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
      logger.info('middleware', 'site-lock: blocked', {
        path: pathname,
        reason: 'no-valid-unlock-cookie',
      });
      return NextResponse.redirect(new URL('/unlock', request.url));
    }
    if (pathname !== '/unlock') {
      logger.info('middleware', 'site-lock: pass', { path: pathname });
    }
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient<Database>(
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
    logger.error('middleware', 'supabase.auth.getUser error', {
      path: pathname,
      error: authError.message,
    });
  }

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isDemo = request.cookies.get('rr-demo')?.value === '1';
  const isServerAction = request.headers.has('next-action');

  logger.info('middleware', 'Request', {
    path: pathname,
    userId: user?.id ?? 'none',
    isProtected,
    isDemo,
    isServerAction,
  });

  if (isProtected && !user && !isDemo) {
    logger.info('middleware', 'Redirect to /', {
      reason: 'unauthenticated-protected',
      path: pathname,
    });
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
      logger.error('middleware', 'Projects query error', {
        userId: user.id,
        error: projError.message,
      });
    }
    const dest = data ? '/dashboard' : '/setup';
    logger.info('middleware', 'Redirect', { dest, userId: user.id, hasProject: !!data });
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/unlock|api).*)'],
};
