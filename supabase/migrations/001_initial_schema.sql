-- ============================================================
-- RivalRadar Initial Schema Migration
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- users (profile table extending auth.users)
create table if not exists users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- app_settings (one row per user)
create table if not exists app_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  cf_account_id         text not null default '',
  cf_api_token          text not null default '',
  google_places_api_key text not null default '',
  serp_api_key          text not null default '',
  anthropic_api_key     text not null default '',
  primary_service       text not null default '',
  location              text not null default '',
  updated_at            timestamptz not null default now()
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
  last_crawled_at timestamptz,
  crawl_job_id    text,
  crawl_status    text not null default 'idle'
                    check (crawl_status in ('idle','pending','running','complete','failed')),
  ai_score        jsonb,
  google_data     jsonb,
  serp_data       jsonb,
  trustpilot_data jsonb,
  created_at      timestamptz not null default now()
);

-- extracted_signals (one row per crawl, full signal blob)
create table if not exists extracted_signals (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  signals     jsonb not null,
  crawled_at  timestamptz not null default now()
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

-- crawl_jobs
create table if not exists crawl_jobs (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  mode         text not null default 'initial' check (mode in ('initial','incremental')),
  status       text not null default 'pending' check (status in ('pending','running','complete','failed')),
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ai_health_scores (historical, for audit trail)
create table if not exists ai_health_scores (
  id                         uuid primary key default uuid_generate_v4(),
  business_id                uuid not null references businesses(id) on delete cascade,
  overall_score              integer not null,
  seo_score                  integer,
  trust_score                integer,
  content_score              integer,
  engagement_score           integer,
  pricing_transparency_score integer,
  summary                    text,
  generated_at               timestamptz not null default now()
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

create index on projects (user_id);
create index on businesses (project_id);
create index on extracted_signals (business_id, crawled_at desc);
create index on change_events (business_id, detected_at desc);
create index on crawl_jobs (business_id);
create index on ai_health_scores (business_id, generated_at desc);
create index on priority_actions (project_id, generated_at desc);

-- ============================================================
-- HELPER FUNCTIONS (used by RLS)
-- ============================================================

create or replace function user_owns_project(p_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from projects where id = p_id and user_id = auth.uid());
$$;

create or replace function project_id_for_business(b_id uuid)
returns uuid language sql security definer stable as $$
  select project_id from businesses where id = b_id;
$$;

-- Auto-create user profile row on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table users             enable row level security;
alter table app_settings      enable row level security;
alter table projects          enable row level security;
alter table businesses        enable row level security;
alter table extracted_signals enable row level security;
alter table change_events     enable row level security;
alter table crawl_jobs        enable row level security;
alter table ai_health_scores  enable row level security;
alter table priority_actions  enable row level security;

create policy "users manage own profile"
  on users for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users manage own settings"
  on app_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users manage own projects"
  on projects for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users manage businesses in own projects"
  on businesses for all
  using (user_owns_project(project_id))
  with check (user_owns_project(project_id));

create policy "users manage signals for own businesses"
  on extracted_signals for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

create policy "users manage change_events for own businesses"
  on change_events for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

create policy "users manage crawl_jobs for own businesses"
  on crawl_jobs for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

create policy "users manage ai_scores for own businesses"
  on ai_health_scores for all
  using (user_owns_project(project_id_for_business(business_id)))
  with check (user_owns_project(project_id_for_business(business_id)));

create policy "users manage priority_actions in own projects"
  on priority_actions for all
  using (user_owns_project(project_id))
  with check (user_owns_project(project_id));
