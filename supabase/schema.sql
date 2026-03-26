-- ============================================================
-- RivalRadar Schema + RLS Policies
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- app_settings (one row per user, stores API keys)
create table if not exists app_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  cf_account_id   text not null default '',
  cf_api_token    text not null default '',
  google_places_api_key text not null default '',
  serp_api_key    text not null default '',
  anthropic_api_key text not null default '',
  primary_service text not null default '',
  location        text not null default '',
  updated_at      timestamptz not null default now()
);

-- projects
create table if not exists projects (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- businesses (own + competitors, linked to a project)
create table if not exists businesses (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null,
  url             text not null,
  domain          text not null,
  is_own_business boolean not null default false,
  crawl_status    text not null default 'idle'
                    check (crawl_status in ('idle','pending','running','complete','failed')),
  crawl_job_id    text,
  last_crawled_at timestamptz,
  created_at      timestamptz not null default now()
);

-- extracted_signals (one row per crawl scan, JSONB signal blobs)
create table if not exists extracted_signals (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  scanned_at  timestamptz not null default now(),
  is_current  boolean not null default true,
  seo         jsonb,
  pricing     jsonb,
  trust       jsonb,
  content     jsonb,
  engagement  jsonb,
  features    jsonb
);

-- change_events
create table if not exists change_events (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  detected_at timestamptz not null default now(),
  severity    text not null check (severity in ('high','medium','low')),
  summary     text not null,
  changes     jsonb not null default '[]'
);

-- google_data
create table if not exists google_data (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references businesses(id) on delete cascade,
  google_rating  numeric(2,1),
  review_count   integer,
  place_id       text,
  address        text,
  recent_reviews jsonb,
  fetched_at     timestamptz not null default now()
);

-- serp_data
create table if not exists serp_data (
  id                   uuid primary key default uuid_generate_v4(),
  business_id          uuid not null references businesses(id) on delete cascade,
  organic_position     integer,
  local_pack_position  integer,
  featured_snippet     boolean not null default false,
  sitelinks            jsonb,
  fetched_at           timestamptz not null default now()
);

-- trustpilot_data
create table if not exists trustpilot_data (
  id                      uuid primary key default uuid_generate_v4(),
  business_id             uuid not null references businesses(id) on delete cascade,
  trustpilot_rating       numeric(2,1),
  review_count            integer,
  trust_score             integer,
  recent_reviews          jsonb,
  fetched_at              timestamptz not null default now()
);

-- ai_health_scores (one row per business, upserted each crawl)
create table if not exists ai_health_scores (
  id                      uuid primary key default uuid_generate_v4(),
  business_id             uuid not null unique references businesses(id) on delete cascade,
  overall_score           integer not null,
  weekly_delta            numeric(5,2),
  reputation_score        integer not null default 0,
  local_visibility_score  integer not null default 0,
  website_health_score    integer not null default 0,
  gbp_completeness_score  integer not null default 0,
  ai_presence_score       integer not null default 0,
  review_velocity_score   integer not null default 0,
  summary                 text,
  generated_at            timestamptz not null default now()
);

-- score_snapshots (historical record for trend tracking)
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

-- priority_actions
create table if not exists priority_actions (
  id                   uuid primary key default uuid_generate_v4(),
  project_id           uuid not null references projects(id) on delete cascade,
  priority             integer not null check (priority in (1,2,3)),
  category             text not null,
  action               text not null,
  reason               text not null,
  competitor_reference text,
  estimated_impact     text not null check (estimated_impact in ('high','medium','low')),
  timeframe            text not null,
  generated_at         timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index on businesses (project_id);
create index on extracted_signals (business_id, is_current);
create index on change_events (business_id, detected_at desc);
create index on google_data (business_id);
create index on serp_data (business_id);
create index on trustpilot_data (business_id);
create index on ai_health_scores (business_id, generated_at desc);
create index on score_snapshots (business_id, snapshot_at desc);
create index on priority_actions (project_id, generated_at desc);

-- ============================================================
-- HELPER FUNCTION (used by RLS policies)
-- ============================================================

-- Returns true if the authenticated user owns the given project
create or replace function user_owns_project(p_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from projects
    where id = p_id
      and user_id = auth.uid()
  );
$$;

-- Returns the project_id for a given business (used by RLS on business-child tables)
create or replace function project_id_for_business(b_id uuid)
returns uuid
language sql
security definer
stable
as $$
  select project_id from businesses where id = b_id;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table app_settings      enable row level security;
alter table projects          enable row level security;
alter table businesses        enable row level security;
alter table extracted_signals enable row level security;
alter table change_events     enable row level security;
alter table google_data       enable row level security;
alter table serp_data         enable row level security;
alter table trustpilot_data   enable row level security;
alter table ai_health_scores  enable row level security;
alter table score_snapshots   enable row level security;
alter table priority_actions  enable row level security;

-- ---- app_settings ----
create policy "users manage own settings"
  on app_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- projects ----
create policy "users manage own projects"
  on projects for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- businesses ----
create policy "users manage businesses in own projects"
  on businesses for all
  using (user_owns_project(project_id))
  with check (user_owns_project(project_id));

-- ---- extracted_signals ----
create policy "users manage signals for own businesses"
  on extracted_signals for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- ---- change_events ----
create policy "users manage change_events for own businesses"
  on change_events for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- ---- google_data ----
create policy "users manage google_data for own businesses"
  on google_data for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- ---- serp_data ----
create policy "users manage serp_data for own businesses"
  on serp_data for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- ---- trustpilot_data ----
create policy "users manage trustpilot_data for own businesses"
  on trustpilot_data for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- ---- ai_health_scores ----
create policy "users manage ai_scores for own businesses"
  on ai_health_scores for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- ---- score_snapshots ----
create policy "users manage score_snapshots for own businesses"
  on score_snapshots for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

-- ---- priority_actions ----
create policy "users manage priority_actions in own projects"
  on priority_actions for all
  using (user_owns_project(project_id))
  with check (user_owns_project(project_id));
