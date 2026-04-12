-- ============================================================
-- RivalRadar Schema Updates
-- ============================================================

-- businesses: add missing columns
alter table businesses
  add column if not exists google_place_id  text,
  add column if not exists ai_visibility    jsonb,
  add column if not exists enrichment_errors jsonb;

-- app_settings: add postcode
alter table app_settings
  add column if not exists postcode text not null default '';

-- extracted_signals: drop old structure, recreate with correct columns
drop table if exists extracted_signals cascade;

create table extracted_signals (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  is_current  boolean not null default true,
  seo         jsonb,
  pricing     jsonb,
  trust       jsonb,
  content     jsonb,
  engagement  jsonb,
  features    jsonb,
  scanned_at  timestamptz not null default now()
);

create index on extracted_signals (business_id, scanned_at desc);
create index on extracted_signals (business_id, is_current);

alter table extracted_signals enable row level security;

create policy "users manage signals for own businesses"
  on extracted_signals for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- crawl_jobs: fix status constraint ('complete' -> 'completed')
alter table crawl_jobs
  drop constraint if exists crawl_jobs_status_check;

alter table crawl_jobs
  add constraint crawl_jobs_status_check
  check (status in ('pending', 'running', 'completed', 'failed'));

-- score_snapshots: new table for weekly delta tracking
create table if not exists score_snapshots (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references businesses(id) on delete cascade,
  overall_score         integer not null,
  reputation_score      integer,
  local_visibility_score integer,
  website_health_score  integer,
  gbp_completeness_score integer,
  ai_presence_score     integer,
  review_velocity_score integer,
  snapshot_at           timestamptz not null default now()
);

create index on score_snapshots (business_id, snapshot_at desc);

alter table score_snapshots enable row level security;

create policy "users manage score_snapshots for own businesses"
  on score_snapshots for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- google_data: historical review counts for velocity tracking
create table if not exists google_data (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  review_count integer,
  fetched_at   timestamptz not null default now()
);

create index on google_data (business_id, fetched_at desc);

alter table google_data enable row level security;

create policy "users manage google_data for own businesses"
  on google_data for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));
