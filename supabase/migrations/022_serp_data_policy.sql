-- ============================================================
-- Record the serp_data RLS policy in the migration history
-- ============================================================
-- This policy existed only in supabase/schema.sql, a hand maintained snapshot
-- that had drifted badly (5 tables missing, 1 table declared that no longer
-- exists) and has now been deleted. Every other policy in that file is already
-- covered by migrations 001, 002, 006 and 009. This one was not, so a rebuild
-- from migrations alone would have left serp_data with RLS on and no policy.
--
-- Written idempotently: it is almost certainly already live on the current
-- project, so you do NOT need to run this now. It exists so that a from scratch
-- rebuild produces the same database.

drop policy if exists "users manage serp_data for own businesses" on serp_data;

create policy "users manage serp_data for own businesses"
  on serp_data for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));
