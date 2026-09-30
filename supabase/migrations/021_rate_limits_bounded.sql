-- ============================================================
-- Bound the rate_limits table and its counter
-- ============================================================
-- Two cost fixes on top of 020, both inside the function body. The table, the
-- index, the signature, the grants and the returned boolean are all unchanged.
--
-- 1. Storage. Nothing deleted expired keys, so the table grew one row per
--    unique key forever. The key is derived from a request header, so a caller
--    that can set it could mint unlimited rows. The in-memory version this
--    replaced self healed on every cold start; a shared table does not.
--
-- 2. Counter. `count` kept incrementing after the limit was passed. At integer
--    max the RPC would throw, the caller fails open, and rate limiting would
--    silently switch off. Clamping at p_limit + 1 keeps every boolean result
--    identical while making that unreachable.

create or replace function check_rate_limit(p_key text, p_limit int, p_window_ms int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Opportunistic housekeeping on roughly 1 call in 1000. No scheduled job and
  -- no extension needed, and the cleanup rate scales with the traffic that
  -- grows the table: a quiet route stays small and never pays for a delete,
  -- while a route under abuse prunes often. Rows an hour past their reset are
  -- idle by definition, the window is 60s.
  if random() < 0.001 then
    delete from rate_limits where reset_at < now() - interval '1 hour';
  end if;

  insert into rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case
                  when now() > rl.reset_at then 1
                  else least(rl.count + 1, p_limit + 1)
                end,
        reset_at = case
                     when now() > rl.reset_at
                       then now() + make_interval(secs => p_window_ms / 1000.0)
                     else rl.reset_at
                   end
  returning rl.count into v_count;

  return v_count > p_limit;
end;
$$;

-- create or replace keeps the existing owner and ACL. Re-asserted so this file
-- is still correct if it is ever run on its own.
revoke all on function check_rate_limit(text, int, int) from public;
revoke all on function check_rate_limit(text, int, int) from anon, authenticated;
grant execute on function check_rate_limit(text, int, int) to service_role;
