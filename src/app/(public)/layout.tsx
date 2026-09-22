import AppShellWithAuth from '@/components/AppShellWithAuth';
import MarketingShell from '@/components/marketing/MarketingShell';
import { getServerUser, isDemoRequest } from '@/lib/supabase/serverAuth';

/**
 * Pages anyone may read. The chrome is chosen on the server from the session
 * cookie, so a signed-in visitor keeps the sidebar and a signed-out one gets
 * the marketing navbar, with no flash of the wrong shell.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [user, isDemo] = await Promise.all([getServerUser(), isDemoRequest()]);

  if (user || isDemo) {
    return <AppShellWithAuth>{children}</AppShellWithAuth>;
  }

  return <MarketingShell>{children}</MarketingShell>;
}
