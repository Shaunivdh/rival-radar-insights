-- ============================================================
-- Project scoped cache for business independent external lookups
-- ============================================================
-- AI visibility web searches and SerpAPI local packs depend only on the
-- project's service and location, not on which business is being crawled.
-- Each business runs as its own Inngest job, so without a shared cache the
-- same lookups were repeated once per business (up to 6 times per project).
--
-- One row per (project, kind, key). `key` is the exact lookup (query text or
-- request URL without credentials); `payload` is the raw response. Freshness
-- is decided by the caller from `fetched_at`. Concurrent writers are
-- coordinated with the existing check_rate_limit claim (migration 021).

create table if not exists project_cache (
  project_id uuid not null references projects (id) on delete cascade,
  kind       text not null,
  key        text not null,
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (project_id, kind, key)
);

-- Server side only, written and read by the crawl worker via service_role.
alter table project_cache enable row level security;
revoke all on table project_cache from anon, authenticated;
