CREATE TABLE IF NOT EXISTS "api_rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer NOT NULL,
  "resets_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
