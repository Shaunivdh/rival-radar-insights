-- ============================================================
-- Finish what 016 started: reputation / GBP completeness are nullable
-- ============================================================
-- 016 dropped NOT NULL from website_health_score, ai_presence_score and
-- review_velocity_score, but reputationScore and gbpCompletenessScore are
-- documented in AIHealthScore as "null = no GBP found, not zero" and the
-- worker writes null for them. On ai_health_scores those two columns are
-- still NOT NULL, so that upsert fails with 23502 for any business without
-- a Google Business Profile. score_snapshots already allows null.

alter table ai_health_scores
  alter column reputation_score       drop not null,
  alter column gbp_completeness_score drop not null;
