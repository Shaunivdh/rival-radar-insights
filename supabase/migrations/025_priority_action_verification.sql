-- ============================================================
-- Scan verification for priority actions
-- ============================================================
-- After each scan, completed template actions are re-checked: 'verified' when the
-- template no longer fires, 'not_verified' when it still does. Null = not checked
-- yet (or an LLM action, which has no deterministic trigger).
--
-- Open template actions whose gap disappears are resolved automatically, but only
-- after two scans in a row agree: gone_since holds the first scan that saw the gap
-- gone, so one glitchy render can never clear an action on its own.

alter table priority_actions
  add column if not exists verification text
    check (verification in ('verified', 'not_verified')),
  add column if not exists verified_at timestamptz,
  add column if not exists gone_since timestamptz,
  add column if not exists auto_resolved boolean not null default false;
