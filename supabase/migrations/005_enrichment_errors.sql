-- Track which enrichment data sources failed per business
alter table businesses
  add column if not exists enrichment_errors jsonb;
