-- Add trustpilot_velocity_score to ai_health_scores and score_snapshots
alter table ai_health_scores
  add column if not exists trustpilot_velocity_score integer;

alter table score_snapshots
  add column if not exists trustpilot_velocity_score integer;
