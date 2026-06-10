-- ============================================================
-- Allow component scores to be NULL ("unknown") instead of 0
-- ============================================================
-- websiteHealthScore, aiPresenceScore, reviewVelocityScore can legitimately
-- be unknown when a crawl is blocked, AI visibility was never checked, or
-- there's no review history. Persisting 0 falsely deflated overallScore on
-- recompute. Switch the columns to nullable and let the app write null.

alter table ai_health_scores
  alter column website_health_score  drop not null,
  alter column ai_presence_score     drop not null,
  alter column review_velocity_score drop not null;

alter table score_snapshots
  alter column website_health_score  drop not null,
  alter column ai_presence_score     drop not null,
  alter column review_velocity_score drop not null;
