-- ============================================================
-- Fix extracted_signals: add per-signal columns + is_current
-- The original migration stored signals as a single jsonb blob,
-- but all application code expects individual columns.
-- ============================================================

alter table extracted_signals
  add column if not exists seo        jsonb,
  add column if not exists pricing    jsonb,
  add column if not exists trust      jsonb,
  add column if not exists content    jsonb,
  add column if not exists engagement jsonb,
  add column if not exists features   jsonb,
  add column if not exists is_current boolean not null default true;

alter table extracted_signals
  add column if not exists crawled_at timestamptz not null default now();

-- Index to quickly find the current signal row per business
create index if not exists idx_extracted_signals_current
  on extracted_signals (business_id, is_current)
  where is_current = true;
