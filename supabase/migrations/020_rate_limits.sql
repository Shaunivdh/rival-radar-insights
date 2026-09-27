-- ============================================================
-- Shared rate limiting
-- ============================================================
-- Replaces the in-memory Map in /api/regenerate-actions, which reset on every
-- cold start and was never shared between serverless instances.
--
-- check_rate_limit() does the read, the increment and the comparison inside a
-- single statement. INSERT .. ON CONFLICT DO UPDATE takes a row lock, so two
-- concurrent requests for the same key cannot both read the same count and
-- both decide they are under the limit.

create table if not exists rate_limits (
  key      text primary key,
  count    integer not null,
  reset_at timestamptz not null
);

-- Supports pruning expired keys.
create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at);

-- Returns true when the caller is OVER the limit and should be rejected.
-- Counting semantics match the previous in-memory limiter exactly:
--   window expired or first ever call -> count = 1, window restarts, false
--   otherwise                         -> count + 1, true once it exceeds p_limit
create or replace function check_rate_limit(p_key text, p_limit int, p_window_ms int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case when now() > rl.reset_at then 1 else rl.count + 1 end,
        reset_at = case
                     when now() > rl.reset_at
                       then now() + make_interval(secs => p_window_ms / 1000.0)
                     else rl.reset_at
                   end
  returning rl.count into v_count;

  return v_count > p_limit;
end;
$$;

-- Server side only. The table is never exposed to the browser and the function
-- is callable by service_role alone.
alter table rate_limits enable row level security;
revoke all on table rate_limits from anon, authenticated;

revoke all on function check_rate_limit(text, int, int) from public;
revoke all on function check_rate_limit(text, int, int) from anon, authenticated;
grant execute on function check_rate_limit(text, int, int) to service_role;
