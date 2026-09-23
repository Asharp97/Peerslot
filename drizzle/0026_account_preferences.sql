ALTER TABLE "profiles"
ADD COLUMN IF NOT EXISTS "preferences" jsonb NOT NULL DEFAULT '{"language":"en","dateFormat":"dmy","timeFormat":"24"}'::jsonb;
