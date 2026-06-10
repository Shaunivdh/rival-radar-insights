-- Add continuity_note column so weekly rescans can persist continuity language
-- (e.g. "Still outstanding from last week", "You completed last week's portfolio action")
alter table priority_actions
  add column if not exists continuity_note text;
