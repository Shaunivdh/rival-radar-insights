'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

type AccountResult = { ok: true } | { ok: false; error: string };

async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
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
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user;
}

/**
 * Everything the user gave us, plus what we generated for them (UK GDPR right of access).
 * Crawled competitor data is public business data and is left out to keep the file usable.
 */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const user = await getSessionUser();

  const [profile, settings, projects] = await Promise.all([
    supabaseAdmin.from('users').select('*').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('app_settings').select('*').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('projects').select('*').eq('user_id', user.id),
  ]);

  const projectIds = (projects.data ?? []).map((p) => p.id);
  const [businesses, actions] = projectIds.length
    ? await Promise.all([
        supabaseAdmin
          .from('businesses')
          .select('id, project_id, name, url, domain, is_own_business, created_at')
          .in('project_id', projectIds),
        supabaseAdmin.from('priority_actions').select('*').in('project_id', projectIds),
      ])
    : [{ data: [] }, { data: [] }];

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    profile: profile.data,
    settings: settings.data,
    projects: projects.data ?? [],
    businesses: businesses.data ?? [],
    priorityActions: actions.data ?? [],
  };
}

/**
 * Permanently deletes the auth user. Rows hang off auth.users / projects / businesses
 * with ON DELETE CASCADE, so the user row delete removes the rest.
 */
export async function deleteAccount(): Promise<AccountResult> {
  let userId: string;
  try {
    userId = (await getSessionUser()).id;
  } catch {
    return { ok: false, error: 'Please sign in again and retry.' };
  }

  try {
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('user_id', userId);
    const projectIds = (projects ?? []).map((p) => p.id);

    if (projectIds.length) {
      const { data: businesses } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .in('project_id', projectIds);
      const businessIds = (businesses ?? []).map((b) => b.id);
      // serp_data was not created by a tracked migration, so its FK may not cascade.
      if (businessIds.length) {
        await supabaseAdmin.from('serp_data').delete().in('business_id', businessIds);
      }
    }

    // Rate-limit keys embed user / project ids; they expire anyway, but clear them now.
    const keys = [`regenerate-actions:${userId}`, ...projectIds.map((id) => `%${id}%`)];
    await supabaseAdmin.from('rate_limits').delete().eq('key', keys[0]);
    for (const pattern of keys.slice(1)) {
      await supabaseAdmin.from('rate_limits').delete().like('key', pattern);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    logger.info('account', 'account deleted', { userId, projects: projectIds.length });
    return { ok: true };
  } catch (e) {
    logger.error('account', 'account deletion failed', {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: 'Could not delete your account. Please contact support.' };
  }
}
