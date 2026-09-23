CREATE INDEX IF NOT EXISTS "api_rate_limits_resets_at_idx"
  ON "api_rate_limits" ("resets_at");
