-- ============================================================
-- Move per-user business details onto each project row
-- ============================================================
-- Previously primary_service, location, postcode lived on app_settings
-- (one row per user). For multi-project users this gave every project
-- the same industry framing. We now store these per-project and the
-- crawl worker reads them from here directly.

alter table projects
  add column if not exists primary_service text,
  add column if not exists location        text,
  add column if not exists postcode        text;

-- Backfill existing projects from the owner's app_settings row.
update projects p
   set primary_service = s.primary_service,
       location        = s.location,
       postcode        = s.postcode
  from app_settings s
 where s.user_id = p.user_id
   and p.primary_service is null;
