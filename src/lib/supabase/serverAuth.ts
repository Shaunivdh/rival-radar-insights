/**
 * Cookie-bound Supabase client for React Server Components.
 * Read only: an RSC cannot write cookies, so session refresh stays in the middleware.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/** The signed-in user for the current request, or null when signed out. */
export async function getServerUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op: the middleware owns cookie writes.
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** True when the visitor is browsing the seeded demo project. */
export async function isDemoRequest() {
  const cookieStore = await cookies();
  return cookieStore.get('rr-demo')?.value === '1';
}
