/**
 * Seed a fully-populated demo project for a dev user — so you can work on the
 * UI without running setup or a crawl. Uses the real schema and the real
 * getProject() read path (scores are computed on first load by calculateScores).
 *
 * Usage:
 *   npx tsx scripts/seed-test-project.ts                 # seeds dev@rivalradar.test
 *   npx tsx scripts/seed-test-project.ts you@example.com # seeds another user
 *
 * Idempotent: deletes the user's existing project(s) first, then re-seeds from
 * scripts/fixtures/week1.json ("Evolve IT vs Competitors", 1 own + 4 competitors).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import fixture from './fixtures/week1.json';
import type { Business } from '../src/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const email = process.argv[2] ?? 'dev@rivalradar.test';
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Project-level details the setup form would normally collect.
const PROJECT = {
  name: (fixture as { name: string }).name,
  primary_service: 'it_services',
  location: 'Bristol',
  postcode: null as string | null,
};

async function findUserId(target: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function insertBusiness(projectId: string, biz: Business, isOwn: boolean) {
  const { data: row, error } = await admin
    .from('businesses')
    .insert({
      project_id: projectId,
      name: biz.name,
      url: biz.url,
      domain: biz.domain,
      is_own_business: isOwn,
      crawl_status: 'complete',
      last_crawled_at: new Date().toISOString(),
      google_data: biz.googleData,
      serp_data: biz.serpData,
      ai_visibility: biz.aiVisibility,
      ai_score: biz.aiScore,
      pagespeed_data: biz.pagespeedData,
    })
    .select('id')
    .single();
  if (error) throw error;

  const businessId = row.id as string;
  if (biz.signals) {
    const { error: sigErr } = await admin.from('extracted_signals').insert({
      business_id: businessId,
      is_current: true,
      status: 'confirmed',
      scanned_at: new Date().toISOString(),
      seo: biz.signals.seo,
      trust: biz.signals.trust,
      content: biz.signals.content,
      engagement: biz.signals.engagement,
    });
    if (sigErr) throw sigErr;
  }
  return businessId;
}

async function main() {
  console.log(`Target Supabase: ${new URL(url!).host}`);
  const userId = await findUserId(email);
  if (!userId) {
    console.error(`No auth user found for ${email}. Run scripts/create-test-user.ts first.`);
    process.exit(1);
  }

  // Idempotent reset — cascade deletes businesses/signals/etc.
  const { data: existing } = await admin.from('projects').select('id').eq('user_id', userId);
  for (const p of existing ?? []) {
    await admin
      .from('projects')
      .delete()
      .eq('id', p.id as string);
  }
  if (existing?.length) console.log(`Removed ${existing.length} existing project(s).`);

  const { data: proj, error: projErr } = await admin
    .from('projects')
    .insert({ user_id: userId, ...PROJECT })
    .select('id')
    .single();
  if (projErr) throw projErr;
  const projectId = proj.id as string;

  const own = (fixture as { ownBusiness: Business }).ownBusiness;
  const competitors = (fixture as { competitors: Business[] }).competitors;

  await insertBusiness(projectId, own, true);
  for (const c of competitors) await insertBusiness(projectId, c, false);

  console.log(`\nSeeded project "${PROJECT.name}" (${projectId})`);
  console.log(`  own business: ${own.name}`);
  console.log(`  competitors:  ${competitors.map((c) => c.name).join(', ')}`);
  console.log(`\nLog in as ${email} → you'll land straight on /dashboard, fully populated.`);
  console.log('Re-run this script anytime to reset the demo data.');
}

main().catch((e) => {
  console.error('Failed:', e.message ?? e);
  process.exit(1);
});
