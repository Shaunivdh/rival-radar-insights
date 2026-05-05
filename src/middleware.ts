import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/competitors', '/changes', '/settings', '/setup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Site-wide password lock
  if (process.env.SITE_PASSWORD) {
    const unlocked = request.cookies.get('site-unlocked')?.value === process.env.SITE_PASSWORD;
    if (!unlocked && pathname !== '/unlock') {
      return NextResponse.redirect(new URL('/unlock', request.url));
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

  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = PROTECTED.some(p => pathname.startsWith(p));

  // Demo mode: unauthenticated users with the rr-demo cookie can access protected routes
  const isDemo = request.cookies.get('rr-demo')?.value === '1';

  if (isProtected && !user && !isDemo) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname === '/' && user) {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    return NextResponse.redirect(new URL(data ? '/dashboard' : '/setup', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/unlock|api).*)'],
};
