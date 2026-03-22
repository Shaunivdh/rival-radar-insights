-- Add missing jsonb columns to businesses table
alter table businesses
  add column if not exists ai_score       jsonb,
  add column if not exists google_data    jsonb,
  add column if not exists serp_data      jsonb,
  add column if not exists trustpilot_data jsonb;
