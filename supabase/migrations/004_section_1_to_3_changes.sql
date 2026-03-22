-- ============================================================
-- Migration 004: Changes from Sections 1–3 refactor
-- ============================================================

-- 1. Rename extracted_signals.crawled_at → scanned_at
--    (queries were fixed in code to use scanned_at; column name now matches)
alter table extracted_signals
  rename column crawled_at to scanned_at;

-- Also rename the index that referenced crawled_at
drop index if exists idx_extracted_signals_current;
create index if not exists idx_extracted_signals_current
  on extracted_signals (business_id, is_current)
  where is_current = true;

-- Recreate the ordering index with the correct column name
drop index if exists extracted_signals_business_id_crawled_at_idx;
create index if not exists idx_extracted_signals_business_scanned
  on extracted_signals (business_id, scanned_at desc);

-- 2. Add postcode to app_settings (used for SerpAPI lat/lng geocoding)
alter table app_settings
  add column if not exists postcode text not null default '';

-- 3. Add ai_visibility to businesses (AI search visibility check result)
alter table businesses
  add column if not exists ai_visibility jsonb;
