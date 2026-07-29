/**
 * Create (or reset) a local dev test user via the Supabase admin API.
 *
 * Usage:
 *   npx tsx scripts/create-test-user.ts                       # defaults below
 *   npx tsx scripts/create-test-user.ts you@example.com pw123 # custom creds
 *
 * The user is created with email_confirm=true so it can sign in immediately
 * (no confirmation email). Idempotent: if the email already exists, its
 * password is reset to the given value instead of erroring.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const email = process.argv[2] ?? 'dev@rivalradar.test';
const password = process.argv[3] ?? 'RivalRadarDev1!';

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target: string) {
  // listUsers is paginated; scan until found or exhausted.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  console.log(`Target Supabase: ${new URL(url!).host}`);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Dev Tester' },
  });

  let userId = data?.user?.id;

  if (error) {
    // Already registered → reset the password so the known creds still work.
    const existing = await findUserByEmail(email);
    if (!existing) throw error;
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (updErr) throw updErr;
    userId = existing.id;
    console.log('User already existed — password reset.');
  } else {
    console.log('User created.');
  }

  console.log('\n  email:    ', email);
  console.log('  password: ', password);
  console.log('  user id:  ', userId);
  console.log('\nSign in at your app login page. To remove later:');
  console.log(`  npx tsx scripts/create-test-user.ts  (re-run resets pw)`);
  console.log(`  or delete user ${userId} in the Supabase dashboard → Authentication.`);
}

main().catch((e) => {
  console.error('Failed:', e.message ?? e);
  process.exit(1);
});
