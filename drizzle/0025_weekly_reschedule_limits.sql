CREATE TABLE "client_reschedule_usage" (
	"provider_id" text NOT NULL,
	"client_id" text NOT NULL,
	"week_starts_on" date NOT NULL,
	"reschedule_count" integer NOT NULL,
	CONSTRAINT "client_reschedule_usage_provider_id_client_id_week_starts_on_pk" PRIMARY KEY("provider_id","client_id","week_starts_on"),
	CONSTRAINT "client_reschedule_usage_count_positive" CHECK ("client_reschedule_usage"."reschedule_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "booking_pages" ADD COLUMN "weekly_reschedule_limit" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_reschedule_usage" ADD CONSTRAINT "client_reschedule_usage_provider_id_provider_profiles_user_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reschedule_usage" ADD CONSTRAINT "client_reschedule_usage_client_id_user_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_reschedule_usage_client_idx" ON "client_reschedule_usage" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "booking_pages" ADD CONSTRAINT "booking_page_weekly_reschedule_limit_valid" CHECK ("booking_pages"."weekly_reschedule_limit" between 0 and 10);
--> statement-breakpoint
-- Runs in the SAME transaction as the appointment mutation. An unavailable
-- slot or failed appointment write rolls this increment back too.
CREATE FUNCTION consume_client_reschedule(
  p_provider_id text,
  p_client_id text,
  p_changed_at timestamp with time zone
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_limit integer;
  v_time_zone text;
  v_week date;
  v_used integer;
BEGIN
  SELECT weekly_reschedule_limit, time_zone INTO v_limit, v_time_zone
    FROM booking_pages WHERE provider_id = p_provider_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking page unavailable';
  END IF;
  v_week := date_trunc('week', p_changed_at AT TIME ZONE v_time_zone)::date;

  -- The primary-key conflict serializes concurrent requests for this client,
  -- provider and week, including requests for different appointments.
  INSERT INTO client_reschedule_usage (provider_id, client_id, week_starts_on, reschedule_count)
    VALUES (p_provider_id, p_client_id, v_week, 1)
    ON CONFLICT (provider_id, client_id, week_starts_on)
    DO UPDATE SET reschedule_count = client_reschedule_usage.reschedule_count + 1
    RETURNING reschedule_count INTO v_used;
  IF v_used > v_limit THEN
    RAISE EXCEPTION 'Weekly client reschedule limit reached'
      USING ERRCODE = 'P0001', CONSTRAINT = 'client_weekly_reschedule_limit';
  END IF;
  RETURN v_used;
END;
$$;
