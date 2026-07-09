-- ============================================================
-- Change-alert confirmation pipeline
-- ============================================================
-- Snapshots start 'confirmed'. When a scan detects genuine (non-oscillating)
-- signal changes, the detection snapshot is flipped to 'pending' and a
-- confirmation crawl runs ~6h later:
--   - change reproduced  -> back to 'confirmed', alert fires
--   - change not reproduced -> 'unconfirmed' (flaky render), no alert
-- Diff baselines and oscillation history only ever use 'confirmed' rows, so a
-- flaky snapshot can never poison a future diff.

alter table extracted_signals
  add column status text not null default 'confirmed'
  check (status in ('confirmed', 'pending', 'unconfirmed'));

-- Pre-launch cleanup: existing change_events were generated without the
-- confirmation pipeline and are largely crawl-extraction artifacts.
delete from change_events;
