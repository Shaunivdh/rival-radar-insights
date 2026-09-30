import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Any Supabase client in this app, typed against the generated schema. */
export type TypedSupabaseClient = SupabaseClient<Database>;
