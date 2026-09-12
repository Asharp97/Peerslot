CREATE TABLE "personal_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_activity_name_valid" CHECK (char_length(btrim("personal_activities"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "personal_activity_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"recurrence" "availability_recurrence" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_activity_schedule_range_valid" CHECK ("personal_activity_schedules"."ends_at" > "personal_activity_schedules"."starts_at" and "personal_activity_schedules"."ends_at" <= "personal_activity_schedules"."starts_at" + interval '24 hours')
);
--> statement-breakpoint
ALTER TABLE "personal_activities" ADD CONSTRAINT "personal_activities_provider_id_provider_profiles_user_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_activity_schedules" ADD CONSTRAINT "personal_activity_schedules_activity_id_personal_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."personal_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_activities_provider_name_unique" ON "personal_activities" USING btree ("provider_id",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "personal_activity_schedules_activity_start_idx" ON "personal_activity_schedules" USING btree ("activity_id","starts_at");