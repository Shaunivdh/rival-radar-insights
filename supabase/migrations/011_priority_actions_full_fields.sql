-- Add missing fields to priority_actions so the full AI response is persisted
alter table priority_actions
  add column if not exists why_it_matters text,
  add column if not exists steps          jsonb,
  add column if not exists effort         text check (effort in ('low','medium','high')),
  add column if not exists outcome        text;

-- Expand priority constraint to allow 1–5
alter table priority_actions drop constraint if exists priority_actions_priority_check;
alter table priority_actions add constraint priority_actions_priority_check check (priority between 1 and 5);
