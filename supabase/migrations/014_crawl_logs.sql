-- ============================================================
-- Crawl Logs & Health Reports
-- ============================================================

-- crawl_logs: structured log of every crawl step
create table if not exists crawl_logs (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  crawl_job_id text,
  step         text not null,
  status       text not null check (status in ('started','success','failed','warning','skipped')),
  message      text,
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create index on crawl_logs (business_id, created_at desc);
create index on crawl_logs (created_at desc);
create index on crawl_logs (status) where status = 'failed';

-- crawl_health_reports: daily aggregate from health check cron
create table if not exists crawl_health_reports (
  id                uuid primary key default uuid_generate_v4(),
  report_date       date not null default current_date,
  total_crawls_24h  integer not null default 0,
  successful        integer not null default 0,
  failed            integer not null default 0,
  stale_recovered   integer not null default 0,
  overdue_requeued  integer not null default 0,
  failure_reasons   jsonb,
  created_at        timestamptz not null default now()
);

create index on crawl_health_reports (report_date desc);

-- RLS
alter table crawl_logs enable row level security;
alter table crawl_health_reports enable row level security;

create policy "users view crawl_logs for own businesses"
  on crawl_logs for select
  using (user_owns_project(project_id_for_business(business_id)));

-- health reports are admin-only (service role); authenticated users
-- can read via the /api/crawl-health endpoint which uses supabaseAdmin
create policy "service role full access to crawl_health_reports"
  on crawl_health_reports for all
  using (true)
  with check (true);
