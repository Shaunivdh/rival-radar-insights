import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, listAccounts, listLocations } from '@/services/gbp';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const token = await getValidToken(user.id);
    const { accounts = [] } = await listAccounts(token);

    const accountsWithLocations = await Promise.all(
      accounts.map(async (account) => {
        const { locations = [] } = await listLocations(token, account.name).catch(() => ({
          locations: [],
        }));
        return { ...account, locations };
      }),
    );

    return NextResponse.json({ accounts: accountsWithLocations });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
