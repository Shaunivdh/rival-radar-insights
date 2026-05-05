import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/competitors', '/changes', '/settings', '/setup'];

async function signUnlockToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('rival-radar-site-unlock'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Site-wide password lock
  if (process.env.SITE_PASSWORD) {
    const cookie = request.cookies.get('site-unlocked')?.value ?? '';
    const expected = await signUnlockToken(process.env.SITE_PASSWORD);
    if (cookie !== expected && pathname !== '/unlock' && !pathname.startsWith('/api/inngest')) {
      console.log(`[middleware] site-lock: blocked path=${pathname} reason=no-valid-unlock-cookie`);
      return NextResponse.redirect(new URL('/unlock', request.url));
    }
    if (pathname !== '/unlock') {
      console.log(`[middleware] site-lock: pass path=${pathname}`);
    }
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
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error(`[middleware] supabase.auth.getUser error path=${pathname}:`, authError.message);
  }

  const isProtected = PROTECTED.some(p => pathname.startsWith(p));
  const isDemo = request.cookies.get('rr-demo')?.value === '1';
  const isServerAction = request.headers.has('next-action');

  console.log(`[middleware] path=${pathname} userId=${user?.id ?? 'none'} isProtected=${isProtected} isDemo=${isDemo} isServerAction=${isServerAction}`);

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
