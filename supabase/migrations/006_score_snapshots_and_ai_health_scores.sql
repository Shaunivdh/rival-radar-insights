-- ============================================================
-- Migration 006: score_snapshots table + ai_health_scores new columns
-- ============================================================

-- 1. Add unique constraint on business_id so we can upsert (one row per business)
alter table ai_health_scores
  drop constraint if exists ai_health_scores_business_id_key;
alter table ai_health_scores
  add constraint ai_health_scores_business_id_key unique (business_id);

-- 2. Add new component score columns to ai_health_scores
alter table ai_health_scores
  add column if not exists weekly_delta         numeric(5,2),
  add column if not exists reputation_score     integer not null default 0,
  add column if not exists local_visibility_score integer not null default 0,
  add column if not exists website_health_score integer not null default 0,
  add column if not exists gbp_completeness_score integer not null default 0,
  add column if not exists ai_presence_score    integer not null default 0,
  add column if not exists review_velocity_score integer not null default 0;

-- 3. Create score_snapshots table for trend tracking
create table if not exists score_snapshots (
  id                      uuid primary key default uuid_generate_v4(),
  business_id             uuid not null references businesses(id) on delete cascade,
  overall_score           integer not null,
  reputation_score        integer not null,
  local_visibility_score  integer not null,
  website_health_score    integer not null,
  gbp_completeness_score  integer not null,
  ai_presence_score       integer not null,
  review_velocity_score   integer not null,
  snapshot_at             timestamptz not null default now()
);

create index if not exists idx_score_snapshots_business_snapshot_at
  on score_snapshots (business_id, snapshot_at desc);

-- 3. RLS
alter table score_snapshots enable row level security;

drop policy if exists "users manage score_snapshots for own businesses" on score_snapshots;
create policy "users manage score_snapshots for own businesses"
  on score_snapshots for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));
