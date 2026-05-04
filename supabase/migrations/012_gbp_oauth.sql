-- GBP OAuth2 token storage (per user; client credentials live in server env vars)
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS gbp_access_token  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gbp_refresh_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gbp_token_expiry  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gbp_account_name  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gbp_location_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gbp_connected_at  TIMESTAMPTZ DEFAULT NULL;
